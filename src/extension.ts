import * as fs from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import { CommandHandlers } from './commands/commandHandlers';
import { ArbFilesProvider } from './providers/arbFilesProvider';
import { ArbFilesTreeDataProvider } from './providers/arbTreeDataProvider';

// Temporary media directory for development
const MEDIA_DIR = 'media';

/**
 * Activate the extension
 */
export async function activate(context: vscode.ExtensionContext) {
  // Create the ARB files provider
  const arbFilesProvider = new ArbFilesProvider(context);
  
  // Create the tree data provider
  const treeDataProvider = new ArbFilesTreeDataProvider(arbFilesProvider);
  
  // Register the tree view
  const treeView = vscode.window.createTreeView('flutter-arb-explorer', {
    treeDataProvider,
    showCollapseAll: true
  });
  
  // Register the tree view in the context
  context.subscriptions.push(treeView);
  
  // Register command handlers
  const commandHandlers = new CommandHandlers(context, arbFilesProvider);
  commandHandlers.registerCommands();
  
  // Ensure media directory exists
  await ensureMediaFilesExist(context);
  
  // Refresh ARB files on startup if auto-detect is enabled
  const config = vscode.workspace.getConfiguration('flutterArbEditor');
  const autoDetect = config.get<boolean>('autoDetectArbFiles', true);
  
  if (autoDetect) {
    await arbFilesProvider.refresh();
  }
  
  console.log('Flutter ARB Editor extension is now active');
}

/**
 * Ensure that media files for the webview exist
 */
async function ensureMediaFilesExist(context: vscode.ExtensionContext): Promise<void> {
  const mediaDir = path.join(context.extensionPath, MEDIA_DIR);
  
  // Create media directory if it doesn't exist
  await fs.ensureDir(mediaDir);
  
  // Create CSS file
  const cssPath = path.join(mediaDir, 'arbEditor.css');
  if (!await fs.pathExists(cssPath)) {
    await fs.writeFile(cssPath, `
      /* Flutter ARB Editor styles */
      :root {
        --container-padding: 20px;
        --input-padding-vertical: 6px;
        --input-padding-horizontal: 10px;
        --input-margin-vertical: 4px;
        --input-margin-horizontal: 0;
      }
      
      body {
        padding: 0;
        margin: 0;
        color: var(--vscode-foreground);
        font-size: var(--vscode-font-size);
        font-weight: var(--vscode-font-weight);
        font-family: var(--vscode-font-family);
        background-color: var(--vscode-editor-background);
      }
      
      .container {
        display: flex;
        flex-direction: column;
        height: 100vh;
      }
      
      .header {
        padding: var(--container-padding);
        padding-bottom: 10px;
        border-bottom: 1px solid var(--vscode-panel-border);
      }
      
      .header h1 {
        margin: 0;
        font-size: 1.5em;
        margin-bottom: 10px;
      }
      
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      
      .content {
        flex: 1;
        padding: var(--container-padding);
        overflow: auto;
      }
      
      .arb-table {
        width: 100%;
        border-collapse: collapse;
      }
      
      .arb-table th, .arb-table td {
        padding: 8px;
        text-align: left;
        border-bottom: 1px solid var(--vscode-panel-border);
        vertical-align: top;
      }
      
      .arb-table th {
        background-color: var(--vscode-editor-background);
        position: sticky;
        top: 0;
        z-index: 1;
      }
      
      .arb-table tr:hover {
        background-color: var(--vscode-list-hoverBackground);
      }
      
      .key-col {
        width: 25%;
      }
      
      .value-col {
        width: 40%;
      }
      
      .desc-col {
        width: 25%;
      }
      
      .actions-col {
        width: 10%;
      }
      
      .value-input {
        width: 100%;
        height: 60px;
        padding: var(--input-padding-vertical) var(--input-padding-horizontal);
        background-color: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border);
        border-radius: 2px;
        resize: vertical;
      }
      
      .btn {
        padding: var(--input-padding-vertical) var(--input-padding-horizontal);
        background-color: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        border-radius: 2px;
        cursor: pointer;
      }
      
      .btn:hover {
        background-color: var(--vscode-button-hoverBackground);
      }
      
      .add-btn {
        background-color: var(--vscode-extensionButton-prominentBackground);
        color: var(--vscode-extensionButton-prominentForeground);
      }
      
      .add-btn:hover {
        background-color: var(--vscode-extensionButton-prominentHoverBackground);
      }
      
      .delete-btn {
        background-color: var(--vscode-errorForeground);
        color: white;
      }
      
      .locale-selector {
        padding: var(--input-padding-vertical) var(--input-padding-horizontal);
        background-color: var(--vscode-dropdown-background);
        color: var(--vscode-dropdown-foreground);
        border: 1px solid var(--vscode-dropdown-border);
        border-radius: 2px;
        min-width: 150px;
      }
      
      /* Modal styles */
      .modal {
        display: none;
        position: fixed;
        z-index: 2;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
      }
      
      .modal-content {
        background-color: var(--vscode-editor-background);
        margin: 15% auto;
        padding: 20px;
        border: 1px solid var(--vscode-panel-border);
        width: 60%;
        max-width: 600px;
      }
      
      .form-group {
        margin-bottom: 15px;
      }
      
      .form-group label {
        display: block;
        margin-bottom: 5px;
      }
      
      .form-group input, .form-group textarea {
        width: 100%;
        padding: var(--input-padding-vertical) var(--input-padding-horizontal);
        background-color: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border);
        border-radius: 2px;
      }
      
      .form-group textarea {
        min-height: 80px;
        resize: vertical;
      }
      
      .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 20px;
      }
      
      .cancel-btn {
        background-color: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
      }
      
      .confirm-btn {
        background-color: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
      }
    `);
  }
  
  // Create JavaScript file
  const jsPath = path.join(mediaDir, 'arbEditor.js');
  if (!await fs.pathExists(jsPath)) {
    await fs.writeFile(jsPath, `
      // This script is loaded by the ARB Editor webview
      // No implementation needed as the script content is included in the webview HTML
    `);
  }
}

/**
 * Deactivate the extension
 */
export function deactivate() {
  console.log('Flutter ARB Editor extension is now deactivated');
}
