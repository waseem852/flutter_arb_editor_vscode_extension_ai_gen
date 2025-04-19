import * as fs from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { ArbEntry, ArbFile, ArbFilesTree } from '../models/arbModels';

/**
 * Provider for ARB files in the workspace
 */
export class ArbFilesProvider {
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
  
  private arbFileWatcher: vscode.FileSystemWatcher | undefined;
  private arbFilesCache: Map<string, ArbFile> = new Map();
  private workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined;
  
  constructor(private context: vscode.ExtensionContext) {
    this.workspaceFolders = vscode.workspace.workspaceFolders;
    this.setupFileWatcher();
  }
  
  /**
   * Set up a file system watcher for ARB files
   */
  private setupFileWatcher() {
    const config = vscode.workspace.getConfiguration('flutterArbEditor');
    const pattern = config.get<string>('arbFilesPattern', '**/l10n/**/*.arb');
    
    // Dispose of existing watcher if any
    if (this.arbFileWatcher) {
      this.arbFileWatcher.dispose();
    }
    
    // Create a new file system watcher
    this.arbFileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
    
    // Register event handlers
    this.arbFileWatcher.onDidCreate(uri => this.onArbFileCreated(uri));
    this.arbFileWatcher.onDidChange(uri => this.onArbFileChanged(uri));
    this.arbFileWatcher.onDidDelete(uri => this.onArbFileDeleted(uri));
    
    // Register disposable
    this.context.subscriptions.push(this.arbFileWatcher);
  }
  
  /**
   * Handle ARB file creation
   */
  private async onArbFileCreated(uri: vscode.Uri) {
    await this.parseArbFile(uri);
    this._onDidChangeTreeData.fire();
  }
  
  /**
   * Handle ARB file changes
   */
  private async onArbFileChanged(uri: vscode.Uri) {
    await this.parseArbFile(uri);
    this._onDidChangeTreeData.fire();
  }
  
  /**
   * Handle ARB file deletion
   */
  private onArbFileDeleted(uri: vscode.Uri) {
    this.arbFilesCache.delete(uri.fsPath);
    this._onDidChangeTreeData.fire();
  }
  
  /**
   * Parse an ARB file and add it to the cache
   */
  private async parseArbFile(uri: vscode.Uri): Promise<ArbFile | undefined> {
    try {
      const content = await fs.readFile(uri.fsPath, 'utf8');
      const arbData = JSON.parse(content);
      
      // Extract locale from filename (e.g., "app_en.arb" -> "en")
      const fileName = path.basename(uri.fsPath);
      const localeMatch = fileName.match(/(?:app_|intl_)?([a-zA-Z]{2}(?:_[a-zA-Z]{2})?)(?:\.arb)?$/);
      const locale = localeMatch ? localeMatch[1] : 'default';
      
      // Process entries
      const entries: ArbEntry[] = [];
      
      for (const key in arbData) {
        // Skip metadata fields that start with @
        if (key.startsWith('@') || key.startsWith('@@')) {
          continue;
        }
        
        const value = arbData[key];
        const metadataKey = '@' + key;
        const metadata = arbData[metadataKey];
        
        if (typeof value === 'string') {
          const entry: ArbEntry = {
            key,
            value,
            description: metadata?.description,
            placeholders: metadata?.placeholders,
          };
          
          entries.push(entry);
        }
      }
      
      // Create ARB file object
      const arbFile: ArbFile = {
        uri: uri.fsPath,
        locale,
        fileName,
        entries,
        metadata: {
          lastModified: new Date(),
        //   '@@locale': arbData['@@locale'],
        //   '@@context': arbData['@@context'],
        }
      };
      
      // Cache the file
      this.arbFilesCache.set(uri.fsPath, arbFile);
      
      return arbFile;
    } catch (error) {
      console.error(`Error parsing ARB file ${uri.fsPath}:`, error);
      return undefined;
    }
  }
  
  /**
   * Refresh ARB files in the workspace
   */
  public async refresh(): Promise<void> {
    this.arbFilesCache.clear();
    await this.findArbFiles();
    this._onDidChangeTreeData.fire();
  }
  
  /**
   * Find ARB files in the workspace
   */
  public async findArbFiles(): Promise<ArbFilesTree[]> {
    const config = vscode.workspace.getConfiguration('flutterArbEditor');
    const pattern = config.get<string>('arbFilesPattern', '**/l10n/**/*.arb');
    const autoDetect = config.get<boolean>('autoDetectArbFiles', true);
    
    if (!autoDetect || !this.workspaceFolders || this.workspaceFolders.length === 0) {
      return [];
    }
    
    const arbFileTrees: ArbFilesTree[] = [];
    
    // Find ARB files in each workspace folder
    for (const folder of this.workspaceFolders) {
      const folderUri = folder.uri;
      const files = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, pattern),
        '**/node_modules/**'
      );
      
      if (files.length > 0) {
        const arbFiles: ArbFile[] = [];
        
        // Parse each ARB file
        for (const fileUri of files) {
          const cachedFile = this.arbFilesCache.get(fileUri.fsPath);
          
          if (cachedFile) {
            arbFiles.push(cachedFile);
          } else {
            const parsedFile = await this.parseArbFile(fileUri);
            if (parsedFile) {
              arbFiles.push(parsedFile);
            }
          }
        }
        
        // Add to the tree
        arbFileTrees.push({
          projectPath: folder.uri.fsPath,
          files: arbFiles
        });
      }
    }
    
    return arbFileTrees;
  }
  
  /**
   * Get all ARB files in the workspace
   */
  public async getAllArbFiles(): Promise<ArbFile[]> {
    const trees = await this.findArbFiles();
    const allFiles: ArbFile[] = [];
    
    for (const tree of trees) {
      allFiles.push(...tree.files);
    }
    
    return allFiles;
  }
  
  /**
   * Get an ARB file by its URI
   */
  public async getArbFile(uri: vscode.Uri): Promise<ArbFile | undefined> {
    const cachedFile = this.arbFilesCache.get(uri.fsPath);
    
    if (cachedFile) {
      return cachedFile;
    }
    
    return this.parseArbFile(uri);
  }
  
  /**
   * Save changes to an ARB file
   */
  public async saveArbFile(arbFile: ArbFile): Promise<boolean> {
    try {
      // Create JSON object from the ARB file data
      const jsonData: Record<string, any> = {};
      
      // Add metadata
      if (arbFile.metadata) {
        if (arbFile.metadata['@@locale']) {
          jsonData['@@locale'] = arbFile.metadata['@@locale'];
        }
        if (arbFile.metadata['@@context']) {
          jsonData['@@context'] = arbFile.metadata['@@context'];
        }
      }
      
      // Add entries and their metadata
      for (const entry of arbFile.entries) {
        // Add the main value
        jsonData[entry.key] = entry.value;
        
        // Add metadata if it exists
        if (entry.description || entry.placeholders) {
          const metadata: Record<string, any> = {};
          
          if (entry.description) {
            metadata.description = entry.description;
          }
          
          if (entry.placeholders && Object.keys(entry.placeholders).length > 0) {
            metadata.placeholders = entry.placeholders;
          }
          
          if (Object.keys(metadata).length > 0) {
            jsonData['@' + entry.key] = metadata;
          }
        }
      }
      
      // Write to file
      await fs.writeFile(arbFile.uri, JSON.stringify(jsonData, null, 2), 'utf8');
      
      // Update cache
      this.arbFilesCache.set(arbFile.uri, {
        ...arbFile,
        metadata: {
          ...arbFile.metadata,
          lastModified: new Date()
        }
      });
      
      return true;
    } catch (error) {
      console.error(`Error saving ARB file ${arbFile.uri}:`, error);
      return false;
    }
  }
}
