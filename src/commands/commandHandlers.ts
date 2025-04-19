import * as fs from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { ArbFile } from '../models/arbModels';
import { ArbFilesProvider } from '../providers/arbFilesProvider';
import { ExcelExporter, ExcelImporter } from '../utils/arbFileUtils';
import { ArbEditorPanel } from '../views/arbEditorPanel';

/**
 * Command handlers for the Flutter ARB Editor extension
 */
export class CommandHandlers {
  constructor(
    private context: vscode.ExtensionContext,
    private arbFilesProvider: ArbFilesProvider
  ) {}

  /**
   * Register all commands
   */
  public registerCommands(): void {
    // Register command handlers
    this.context.subscriptions.push(
      vscode.commands.registerCommand('flutter-arb-editor.openArbEditor', this.openArbEditor.bind(this)),
      vscode.commands.registerCommand('flutter-arb-editor.refreshArbFiles', this.refreshArbFiles.bind(this)),
      vscode.commands.registerCommand('flutter-arb-editor.exportToExcel', this.exportToExcel.bind(this)),
      vscode.commands.registerCommand('flutter-arb-editor.importFromExcel', this.importFromExcel.bind(this)),
      vscode.commands.registerCommand('flutter-arb-editor.generateI18n', this.generateI18n.bind(this)),
      vscode.commands.registerCommand('flutter-arb-editor.addNewTranslation', this.addNewTranslation.bind(this)),
      vscode.commands.registerCommand('flutter-arb-editor.saveArbFile', this.saveArbFile.bind(this))
    );
  }

  /**
   * Open the ARB editor panel
   */
  private async openArbEditor(args?: { uri?: string }): Promise<void> {
    try {
      let arbFile: ArbFile | undefined;
      let arbFiles: ArbFile[] = [];

      // If a URI is provided, open that specific ARB file
      if (args?.uri) {
        const uri = typeof args.uri === 'string' ? vscode.Uri.file(args.uri) : args.uri;
        arbFile = await this.arbFilesProvider.getArbFile(uri);
      } else if (vscode.window.activeTextEditor) {
        // If no URI is provided but there's an active editor, try to open that file
        const uri = vscode.window.activeTextEditor.document.uri;
        if (uri.fsPath.endsWith('.arb')) {
          arbFile = await this.arbFilesProvider.getArbFile(uri);
        }
      }

      // If still no ARB file is found, show a picker to select one
      if (!arbFile) {
        arbFiles = await this.arbFilesProvider.getAllArbFiles();
        
        if (arbFiles.length === 0) {
          vscode.window.showInformationMessage('No ARB files found in the workspace.');
          return;
        }
        
        const items = arbFiles.map(file => ({
          label: file.fileName,
          description: file.locale,
          file
        }));
        
        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select an ARB file to open'
        });
        
        if (!selected) {
          return;
        }
        
        arbFile = selected.file;
      }

      // If the full list of ARB files hasn't been loaded yet, load it
      if (arbFiles.length === 0) {
        arbFiles = await this.arbFilesProvider.getAllArbFiles();
      }

      // Open the ARB editor panel
      ArbEditorPanel.createOrShow(this.context.extensionUri, arbFile, arbFiles);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open ARB editor: ${error}`);
    }
  }

  /**
   * Refresh ARB files in the workspace
   */
  private async refreshArbFiles(): Promise<void> {
    try {
      await this.arbFilesProvider.refresh();
      vscode.window.showInformationMessage('ARB files refreshed.');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to refresh ARB files: ${error}`);
    }
  }

  /**
   * Export ARB files to Excel
   */
  private async exportToExcel(args?: { arbFiles?: ArbFile[], currentFile?: ArbFile }): Promise<void> {
    try {
      let arbFiles: ArbFile[] = args?.arbFiles || [];

      // If no ARB files are provided, get all ARB files
      if (arbFiles.length === 0) {
        arbFiles = await this.arbFilesProvider.getAllArbFiles();
      }

      if (arbFiles.length === 0) {
        vscode.window.showInformationMessage('No ARB files found to export.');
        return;
      }

      // Export to Excel
      const excelFilePath = await ExcelExporter.exportToExcel(arbFiles);

      if (excelFilePath) {
        vscode.window.showInformationMessage(`Successfully exported to ${excelFilePath}`);
        
        // Ask if the user wants to open the Excel file
        const openExcel = await vscode.window.showInformationMessage(
          'Export completed. Would you like to open the Excel file?',
          'Open',
          'No'
        );
        
        if (openExcel === 'Open') {
          // Open the Excel file
          vscode.env.openExternal(vscode.Uri.file(excelFilePath));
        }
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to export to Excel: ${error}`);
    }
  }

  /**
   * Import ARB files from Excel
   */
  private async importFromExcel(args?: { arbFiles?: ArbFile[], currentFile?: ArbFile }): Promise<void> {
    try {
      let arbFiles: ArbFile[] = args?.arbFiles || [];

      // If no ARB files are provided, get all ARB files
      if (arbFiles.length === 0) {
        arbFiles = await this.arbFilesProvider.getAllArbFiles();
      }

      if (arbFiles.length === 0) {
        vscode.window.showInformationMessage('No ARB files found to import into.');
        return;
      }

      // Import from Excel
      const updatedArbFiles = await ExcelImporter.importFromExcel(arbFiles);

      // Save the updated ARB files
      for (const arbFile of updatedArbFiles) {
        await this.arbFilesProvider.saveArbFile(arbFile);
      }

      vscode.window.showInformationMessage(`Successfully imported from Excel to ${updatedArbFiles.length} ARB files.`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to import from Excel: ${error}`);
    }
  }
  /**
   * Generate i18n code using Flutter's built-in localization code generation
   */
  private async generateI18n(args?: { arbFiles?: ArbFile[] }): Promise<void> {
    try {
      let arbFiles: ArbFile[] = args?.arbFiles || [];

      // If no ARB files are provided, get all ARB files
      if (arbFiles.length === 0) {
        arbFiles = await this.arbFilesProvider.getAllArbFiles();
      }

      if (arbFiles.length === 0) {
        vscode.window.showInformationMessage('No ARB files found to generate code from.');
        return;
      }

      // Get the Flutter project root (parent directory of the first ARB file)
      const projectRoot = path.dirname(path.dirname(arbFiles[0].uri));

      // Check if this is a Flutter project by looking for pubspec.yaml
      const pubspecPath = path.join(projectRoot, 'pubspec.yaml');
      if (!await fs.pathExists(pubspecPath)) {
        vscode.window.showErrorMessage('Could not find pubspec.yaml. Please ensure you are in a Flutter project.');
        return;
      }      // Read pubspec.yaml to check/update flutter_localizations dependency
      const pubspecContent = await fs.readFile(pubspecPath, 'utf8');
      
      // Create terminal in the project directory
      const terminal = vscode.window.createTerminal({
        name: 'Flutter l10n',
        cwd: projectRoot
      });
      
      terminal.show();
        // Add flutter_localizations if not already present
      if (!pubspecContent.includes('flutter_localizations:')) {
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'Adding flutter_localizations dependency...',
          cancellable: false
        }, async () => {
          // Run the command using PowerShell in the project directory
          const result = await new Promise<void>((resolve) => {
            terminal.sendText('flutter pub add flutter_localizations --sdk=flutter; if ($?) { Write-Host "DONE" }');
            
            const disposable = vscode.window.onDidCloseTerminal(closedTerminal => {
              if (closedTerminal === terminal) {
                disposable.dispose();
                resolve();
              }
            });
          });
        });
      }
      
      // Update l10n configuration in pubspec.yaml if needed
      if (!pubspecContent.includes('generate: true')) {
        const l10nConfig = `
flutter:
  generate: true # Add this line
  uses-material-design: true`;
        
        try {
          const updatedContent = pubspecContent.includes('flutter:') 
            ? pubspecContent.replace(/flutter:([^\n]*\n(?:[ \t]+[^\n]+\n)*)/m, l10nConfig)
            : pubspecContent + '\n' + l10nConfig;
            
          await fs.writeFile(pubspecPath, updatedContent);
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to update pubspec.yaml: ${error}`);
          return;
        }
      }
      
      // Create l10n.yaml if it doesn't exist
      const l10nConfigPath = path.join(projectRoot, 'l10n.yaml');
      if (!await fs.pathExists(l10nConfigPath)) {
        const l10nConfig = `
arb-dir: ${path.relative(projectRoot, path.dirname(arbFiles[0].uri))}
template-arb-file: ${path.basename(arbFiles[0].uri)}
output-localization-file: app_localizations.dart
output-class: AppLocalizations
`;
        await fs.writeFile(l10nConfigPath, l10nConfig.trim());
      }
      
      // Run flutter gen-l10n
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Generating Flutter localizations...',
        cancellable: false
      }, async () => {
        await new Promise<void>((resolve) => {
          // Run the command using PowerShell and wait for completion
          terminal.sendText('flutter gen-l10n; if ($?) { Write-Host "DONE" }');
          
          const disposable = vscode.window.onDidCloseTerminal(closedTerminal => {
            if (closedTerminal === terminal) {
              disposable.dispose();
              resolve();
            }
          });
        });
      });
      
      vscode.window.showInformationMessage('Flutter localizations generated successfully.');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to generate i18n code: ${error}`);
    }
  }

  /**
   * Add a new translation
   */
  private async addNewTranslation(): Promise<void> {
    try {
      const arbFiles = await this.arbFilesProvider.getAllArbFiles();
      
      if (arbFiles.length === 0) {
        vscode.window.showInformationMessage('No ARB files found in the workspace.');
        return;
      }
      
      // Ask for key
      const key = await vscode.window.showInputBox({
        prompt: 'Enter a key for the new translation',
        placeHolder: 'e.g. welcomeMessage',
        validateInput: (value) => {
          if (!value) {
            return 'Key is required';
          }
          
          // Check if the key already exists
          for (const file of arbFiles) {
            if (file.entries.some(entry => entry.key === value)) {
              return `Key "${value}" already exists`;
            }
          }
          
          return null;
        }
      });
      
      if (!key) {
        return;
      }
      
      // Ask for default value
      const value = await vscode.window.showInputBox({
        prompt: 'Enter the default value for the new translation',
        placeHolder: 'e.g. Welcome to our app!'
      });
      
      if (value === undefined) {
        return;
      }
      
      // Ask for description (optional)
      const description = await vscode.window.showInputBox({
        prompt: 'Enter a description for the new translation (optional)',
        placeHolder: 'e.g. Welcome message shown on the home screen'
      });
      
      // Add the new translation to all ARB files
      for (const arbFile of arbFiles) {
        arbFile.entries.push({
          key,
          value: arbFile === arbFiles[0] ? value : '',
          description: description || undefined
        });
        
        // Save the changes
        await this.arbFilesProvider.saveArbFile(arbFile);
      }
      
      vscode.window.showInformationMessage(`Successfully added new translation key "${key}".`);
      
      // Ask if the user wants to open the ARB editor
      const openEditor = await vscode.window.showInformationMessage(
        'Would you like to open the ARB editor to complete the translations?',
        'Open Editor',
        'No'
      );
      
      if (openEditor === 'Open Editor') {
        this.openArbEditor({ uri: arbFiles[0].uri });
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to add new translation: ${error}`);
    }
  }

  /**
   * Save an ARB file
   */
  private async saveArbFile(args: { arbFile: ArbFile }): Promise<boolean> {
    try {
      const { arbFile } = args;
      
      if (!arbFile) {
        vscode.window.showErrorMessage('No ARB file provided to save.');
        return false;
      }
      
      const success = await this.arbFilesProvider.saveArbFile(arbFile);
      
      if (success) {
        // No need to show a message for every save
        return true;
      } else {
        vscode.window.showErrorMessage(`Failed to save ARB file: ${arbFile.fileName}`);
        return false;
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to save ARB file: ${error}`);
      return false;
    }
  }
}
