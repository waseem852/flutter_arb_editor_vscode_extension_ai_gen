import * as path from 'path';
import * as vscode from 'vscode';
import { ArbFile } from '../models/arbModels';
import { ArbFilesProvider } from './arbFilesProvider';

/**
 * Tree item types for the ARB Files Explorer
 */
export enum ArbTreeItemType {
  PROJECT,
  FOLDER,
  FILE,
  ENTRY
}

/**
 * Tree item for ARB Files Explorer
 */
export class ArbTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly type: ArbTreeItemType,
    public readonly arbFile?: ArbFile,
    public readonly projectPath?: string,
    public readonly entryKey?: string
  ) {
    super(label, collapsibleState);

    switch (type) {
      case ArbTreeItemType.PROJECT:
        this.iconPath = new vscode.ThemeIcon('folder');
        this.tooltip = `Project: ${path.basename(projectPath || '')}`;
        this.description = 'Flutter Project';
        this.contextValue = 'project';
        break;
      
      case ArbTreeItemType.FOLDER:
        this.iconPath = new vscode.ThemeIcon('folder-library');
        this.tooltip = 'ARB Files Collection';
        this.description = 'ARB Files';
        this.contextValue = 'arbFolder';
        break;
      
      case ArbTreeItemType.FILE:
        this.iconPath = new vscode.ThemeIcon('globe');
        this.tooltip = `Locale: ${arbFile?.locale || 'unknown'}`;
        this.description = arbFile?.locale;
        this.contextValue = 'arbFile';
        
        // Add command to open the ARB file in the editor
        this.command = {
          command: 'flutter-arb-editor.openArbEditor',
          title: 'Open ARB Editor',
          arguments: [{ uri: arbFile?.uri }]
        };
        break;
      
      case ArbTreeItemType.ENTRY:
        this.iconPath = new vscode.ThemeIcon('symbol-string');
        this.tooltip = entryKey || '';
        this.contextValue = 'arbEntry';
        break;
    }
  }
}

/**
 * Tree data provider for ARB Files Explorer
 */
export class ArbFilesTreeDataProvider implements vscode.TreeDataProvider<ArbTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ArbTreeItem | undefined | null | void> = new vscode.EventEmitter<ArbTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<ArbTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  constructor(private arbFilesProvider: ArbFilesProvider) {
    // Refresh the tree view when the ARB files change
    this.arbFilesProvider.onDidChangeTreeData(() => {
      this._onDidChangeTreeData.fire();
    });
  }

  /**
   * Refresh the tree view
   */
  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Get tree item for a given element
   */
  getTreeItem(element: ArbTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children for a given element
   */
  async getChildren(element?: ArbTreeItem): Promise<ArbTreeItem[]> {
    if (!element) {
      // Root level: Show projects with ARB files
      const arbFileTrees = await this.arbFilesProvider.findArbFiles();
      
      return arbFileTrees.map(tree => {
        const projectName = path.basename(tree.projectPath);
        return new ArbTreeItem(
          projectName,
          vscode.TreeItemCollapsibleState.Expanded,
          ArbTreeItemType.PROJECT,
          undefined,
          tree.projectPath
        );
      });
    }

    // Handle different tree item types
    switch (element.type) {
      case ArbTreeItemType.PROJECT:
        // Show ARB files folder for the project
        return [
          new ArbTreeItem(
            'ARB Files',
            vscode.TreeItemCollapsibleState.Expanded,
            ArbTreeItemType.FOLDER,
            undefined,
            element.projectPath
          )
        ];
      
      case ArbTreeItemType.FOLDER:
        // Show ARB files in the folder
        const arbFileTrees = await this.arbFilesProvider.findArbFiles();
        const projectTree = arbFileTrees.find(tree => tree.projectPath === element.projectPath);
        
        if (!projectTree) {
          return [];
        }
        
        return projectTree.files.map(file => {
          return new ArbTreeItem(
            file.fileName,
            vscode.TreeItemCollapsibleState.Collapsed,
            ArbTreeItemType.FILE,
            file
          );
        });
      
      case ArbTreeItemType.FILE:
        // Show entries in the ARB file
        if (element.arbFile) {
          return element.arbFile.entries.map(entry => {
            return new ArbTreeItem(
              entry.key,
              vscode.TreeItemCollapsibleState.None,
              ArbTreeItemType.ENTRY,
              element.arbFile,
              undefined,
              entry.key
            );
          });
        }
        break;
    }

    return [];
  }
}
