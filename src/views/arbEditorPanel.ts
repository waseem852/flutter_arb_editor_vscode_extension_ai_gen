import * as vscode from 'vscode';
import { ArbEntry, ArbFile } from '../models/arbModels';

/**
 * ArbEditorPanel manages the webview panel for editing ARB files
 */
export class ArbEditorPanel {
  public static readonly viewType = 'flutterArbEditor';
  
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _arbFiles: ArbFile[] = [];
  private _currentFile?: ArbFile;
  
  /**
   * Create or show an ARB editor panel
   */
  public static createOrShow(extensionUri: vscode.Uri, arbFile?: ArbFile, arbFiles: ArbFile[] = []) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;
    
    // If we already have a panel, show it
    if (ArbEditorPanel.currentPanel) {
      ArbEditorPanel.currentPanel._panel.reveal(column);
      
      if (arbFile) {
        ArbEditorPanel.currentPanel.updateContent(arbFile, arbFiles);
      }
      
      return;
    }
    
    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      ArbEditorPanel.viewType,
      'Flutter ARB Editor',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'media'),
          vscode.Uri.joinPath(extensionUri, 'dist')
        ],
        retainContextWhenHidden: true
      }
    );
    
    ArbEditorPanel.currentPanel = new ArbEditorPanel(panel, extensionUri, arbFile, arbFiles);
  }
  
  private static currentPanel: ArbEditorPanel | undefined;
  
  /**
   * Create a new ARB editor panel
   */
  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    initialFile?: ArbFile,
    arbFiles: ArbFile[] = []
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._arbFiles = arbFiles;
    this._currentFile = initialFile;
    
    // Set the webview's initial html content
    this._update();
    
    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    
    // Update the content when the panel becomes visible again
    this._panel.onDidChangeViewState(
      e => {
        if (this._panel.visible) {
          this._update();
        }
      },
      null,
      this._disposables
    );
    
    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'updateEntry':
            this.handleUpdateEntry(message.data);
            break;
          case 'addEntry':
            this.handleAddEntry(message.data);
            break;
          case 'deleteEntry':
            this.handleDeleteEntry(message.data);
            break;
          case 'changeFile':
            this.handleChangeFile(message.data);
            break;
          case 'exportToExcel':
            vscode.commands.executeCommand('flutter-arb-editor.exportToExcel', {
              arbFiles: this._arbFiles,
              currentFile: this._currentFile
            });
            break;
          case 'importFromExcel':
            vscode.commands.executeCommand('flutter-arb-editor.importFromExcel', {
              arbFiles: this._arbFiles,
              currentFile: this._currentFile
            });
            break;
          case 'generateI18n':
            vscode.commands.executeCommand('flutter-arb-editor.generateI18n', {
              arbFiles: this._arbFiles
            });
            break;
        }
      },
      null,
      this._disposables
    );
  }
  
  /**
   * Update the ARB files and refresh the editor
   */
  public updateContent(arbFile: ArbFile, arbFiles: ArbFile[] = []) {
    this._currentFile = arbFile;
    
    if (arbFiles.length > 0) {
      this._arbFiles = arbFiles;
    }
    
    this._update();
  }
    /**
   * Handle updates to an ARB entry
   */
  private async handleUpdateEntry(data: { key: string; value?: string; description?: string; locale?: string }) {
    const { key, value, description, locale } = data;
    
    if (description !== undefined) {
      // Update description in all files to keep them in sync
      await this._syncDescription(key, description);
    }
    
    if (value !== undefined && locale) {
      // Update value for specific locale
      const arbFile = this._arbFiles.find(file => file.locale === locale);
      if (arbFile) {
        const entry = arbFile.entries.find(entry => entry.key === key);
        if (entry) {
          entry.value = value;
          await vscode.commands.executeCommand('flutter-arb-editor.saveArbFile', { arbFile });
        }
      }
    }
    
    // Notify the webview
    this._panel.webview.postMessage({ 
      command: 'entrySaved', 
      data: { key, locale } 
    });
  }
  
  /**
   * Handle adding a new ARB entry
   */
  private async handleAddEntry(data: { key: string; value: string; description?: string }) {
    const { key, value, description } = data;
    
    if (!this._currentFile) {
      return;
    }
    
    // Check if the key already exists
    if (this._currentFile.entries.some(entry => entry.key === key)) {
      this._panel.webview.postMessage({ 
        command: 'error', 
        data: { message: `Entry with key "${key}" already exists.` } 
      });
      return;
    }
    
    // Add the entry to all ARB files
    for (const arbFile of this._arbFiles) {
      arbFile.entries.push({
        key,
        value: arbFile === this._currentFile ? value : '',
        description: description
      });
      
      // Save the changes
      await vscode.commands.executeCommand('flutter-arb-editor.saveArbFile', { arbFile });
    }
    
    // Refresh the editor
    this._update();
    
    // Notify the webview
    this._panel.webview.postMessage({ 
      command: 'entryAdded', 
      data: { key } 
    });
  }
  
  /**
   * Handle deleting an ARB entry
   */
  private async handleDeleteEntry(data: { key: string }) {
    const { key } = data;
    
    // Confirm deletion
    const confirmation = await vscode.window.showWarningMessage(
      `Are you sure you want to delete the entry "${key}" from all locale files?`,
      { modal: true },
      'Yes',
      'No'
    );
    
    if (confirmation !== 'Yes') {
      return;
    }
    
    // Delete the entry from all ARB files
    for (const arbFile of this._arbFiles) {
      arbFile.entries = arbFile.entries.filter(entry => entry.key !== key);
      
      // Save the changes
      await vscode.commands.executeCommand('flutter-arb-editor.saveArbFile', { arbFile });
    }
    
    // Refresh the editor
    this._update();
    
    // Notify the webview
    this._panel.webview.postMessage({ 
      command: 'entryDeleted', 
      data: { key } 
    });
  }
  
  /**
   * Handle changing the current ARB file
   */
  private handleChangeFile(data: { locale: string }) {
    const { locale } = data;
    
    // Find the ARB file with the given locale
    const arbFile = this._arbFiles.find(file => file.locale === locale);
    if (!arbFile) {
      return;
    }
    
    this._currentFile = arbFile;
    this._update();
  }
  
  /**
   * Dispose of the panel and clean up resources
   */
  public dispose() {
    ArbEditorPanel.currentPanel = undefined;
    
    // Clean up our resources
    this._panel.dispose();
    
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
  
  /**
   * Update the webview content
   */
  private _update() {
    const webview = this._panel.webview;
    this._panel.title = this._currentFile 
      ? `ARB Editor: ${this._currentFile.fileName}`
      : 'Flutter ARB Editor';
    
    webview.html = this._getHtmlForWebview(webview);
  }
  
  /**
   * Get the HTML for the webview
   */
  private _getHtmlForWebview(webview: vscode.Webview) {
    // Get the local path to script and css resources
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'arbEditor.js')
    );
    
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'arbEditor.css')
    );
    
    // Use a nonce to only allow specific scripts to be run
    const nonce = this._getNonce();
    
    // Convert ARB files to JSON for the webview
    const arbFilesJson = JSON.stringify(this._arbFiles);
    const currentFileJson = this._currentFile 
      ? JSON.stringify(this._currentFile)
      : 'null';
      return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
      <link href="${styleUri}" rel="stylesheet">
      <title>Flutter ARB Editor</title>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Flutter ARB Editor</h1>
          <div class="actions">
            <button id="addEntryBtn" class="btn add-btn">Add New Entry</button>
            <button id="exportBtn" class="btn export-btn">Export to Excel</button>
            <button id="importBtn" class="btn import-btn">Import from Excel</button>
            <button id="generateBtn" class="btn generate-btn">Generate i18n</button>
          </div>
        </div>
        
        <div class="content">
          <div class="table-container">
            <table id="arbTable" class="arb-table">
              <thead>
                <tr>
                  <th class="key-col sticky-col">Key</th>
                  <th class="desc-col sticky-col">Description</th>
                  ${this._arbFiles.map(file => `
                    <th class="value-col">${file.locale} (${file.fileName})</th>
                  `).join('')}
                  <th class="actions-col sticky-col">Actions</th>
                </tr>
              </thead>
              <tbody>              ${this._getAllUniqueEntries().map((entry: ArbEntry) => `
                  <tr data-key="${entry.key}">
                    <td class="key-col sticky-col">${entry.key}</td>
                    <td class="desc-col sticky-col">
                      <textarea class="desc-input" data-key="${entry.key}">${entry.description || ''}</textarea>
                    </td>
                    ${this._arbFiles.map(file => {
                      const fileEntry = file.entries.find(e => e.key === entry.key);
                      return `
                        <td class="value-col">
                          <textarea class="value-input" data-key="${entry.key}" data-locale="${file.locale}">${fileEntry?.value || ''}</textarea>
                        </td>
                      `;
                    }).join('')}
                    <td class="actions-col sticky-col">
                      <button class="btn delete-btn" data-key="${entry.key}">Delete</button>
                    </td>
                  </tr>
                `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      
      <div id="addEntryModal" class="modal">
        <div class="modal-content">
          <h2>Add New Entry</h2>
          <div class="form-group">
            <label for="newEntryKey">Key:</label>
            <input type="text" id="newEntryKey" placeholder="Enter key">
          </div>
          <div class="form-group">
            <label for="newEntryValue">Value:</label>
            <textarea id="newEntryValue" placeholder="Enter value"></textarea>
          </div>
          <div class="form-group">
            <label for="newEntryDesc">Description (optional):</label>
            <textarea id="newEntryDesc" placeholder="Enter description"></textarea>
          </div>
          <div class="modal-actions">
            <button id="cancelAddEntry" class="btn cancel-btn">Cancel</button>
            <button id="confirmAddEntry" class="btn confirm-btn">Add Entry</button>
          </div>
        </div>
      </div>
      
      <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const arbFiles = ${arbFilesJson};
        const currentFile = ${currentFileJson};
        
        // Initialize the state
        vscode.setState({ arbFiles, currentFile });
        
        // Initialize the editor when the DOM is loaded
        document.addEventListener('DOMContentLoaded', () => {
          initArbEditor();
        });
          // Main initialization function
        function initArbEditor() {
          document.getElementById('addEntryBtn').addEventListener('click', showAddEntryModal);
          document.getElementById('exportBtn').addEventListener('click', handleExport);
          document.getElementById('importBtn').addEventListener('click', handleImport);
          document.getElementById('generateBtn').addEventListener('click', handleGenerate);
          document.getElementById('cancelAddEntry').addEventListener('click', hideAddEntryModal);
          document.getElementById('confirmAddEntry').addEventListener('click', handleAddEntry);
          
          // Set up event listeners for value changes
          const valueInputs = document.querySelectorAll('.value-input');
          valueInputs.forEach(input => {
            input.addEventListener('blur', handleValueChange);
          });
          
          // Set up event listeners for description changes
          const descInputs = document.querySelectorAll('.desc-input');
          descInputs.forEach(input => {
            input.addEventListener('blur', handleDescriptionChange);
          });
          
          // Set up event listeners for delete buttons
          const deleteButtons = document.querySelectorAll('.delete-btn');
          deleteButtons.forEach(button => {
            button.addEventListener('click', handleDeleteEntry);
          });
        }
        
        // Handle changing a value
        function handleValueChange(event) {
          const key = event.target.dataset.key;
          const locale = event.target.dataset.locale;
          const value = event.target.value;
          
          vscode.postMessage({
            command: 'updateEntry',
            data: { key, value, locale }
          });
        }
        
        // Handle changing a description
        function handleDescriptionChange(event) {
          const key = event.target.dataset.key;
          const description = event.target.value;
          
          vscode.postMessage({
            command: 'updateEntry',
            data: { key, description }
          });
        }
        
        // Show the add entry modal
        function showAddEntryModal() {
          document.getElementById('addEntryModal').style.display = 'block';
        }
        
        // Hide the add entry modal
        function hideAddEntryModal() {
          document.getElementById('addEntryModal').style.display = 'none';
          document.getElementById('newEntryKey').value = '';
          document.getElementById('newEntryValue').value = '';
          document.getElementById('newEntryDesc').value = '';
        }
        
        // Handle adding a new entry
        function handleAddEntry() {
          const key = document.getElementById('newEntryKey').value.trim();
          const value = document.getElementById('newEntryValue').value;
          const description = document.getElementById('newEntryDesc').value.trim();
          
          if (!key) {
            alert('Key is required');
            return;
          }
          
          vscode.postMessage({
            command: 'addEntry',
            data: { key, value, description: description || undefined }
          });
          
          hideAddEntryModal();
        }
        
        // Handle changing a value
        function handleValueChange(event) {
          const key = event.target.dataset.key;
          const value = event.target.value;
          const locale = currentFile.locale;
          
          vscode.postMessage({
            command: 'updateEntry',
            data: { key, value, locale }
          });
        }
        
        // Handle deleting an entry
        function handleDeleteEntry(event) {
          const key = event.target.dataset.key;
          
          vscode.postMessage({
            command: 'deleteEntry',
            data: { key }
          });
        }
        
        // Handle exporting to Excel
        function handleExport() {
          vscode.postMessage({
            command: 'exportToExcel'
          });
        }
        
        // Handle importing from Excel
        function handleImport() {
          vscode.postMessage({
            command: 'importFromExcel'
          });
        }
        
        // Handle generating i18n code
        function handleGenerate() {
          vscode.postMessage({
            command: 'generateI18n'
          });
        }
        
        // Handle messages from the extension
        window.addEventListener('message', event => {
          const message = event.data;
          
          switch (message.command) {
            case 'entrySaved':
              // Handle successful save
              break;
              
            case 'entryAdded':
              // Handle successful addition
              break;
              
            case 'entryDeleted':
              // Handle successful deletion
              break;
              
            case 'error':
              alert(message.data.message);
              break;
          }
        });
      </script>
    </body>
    </html>`;
  }
  
  /**
   * Generate a nonce for script execution
   */
  private _getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
  
  /**
   * Get all unique entries across all ARB files
   */
  private _getAllUniqueEntries(): ArbEntry[] {
    const entriesMap = new Map<string, ArbEntry>();
    
    // Collect all entries across all files
    for (const file of this._arbFiles) {
      for (const entry of file.entries) {
        if (!entriesMap.has(entry.key)) {
          entriesMap.set(entry.key, { ...entry });
        }
      }
    }
    
    // Convert to array and sort by key
    return Array.from(entriesMap.values()).sort((a, b) => a.key.localeCompare(b.key));
  }
  
  /**
   * Synchronize a description across all ARB files
   */
  private async _syncDescription(key: string, description: string): Promise<void> {
    for (const arbFile of this._arbFiles) {
      const entry = arbFile.entries.find(e => e.key === key);
      if (entry) {
        entry.description = description;
      } else {
        // If the entry doesn't exist in this locale, create it
        arbFile.entries.push({
          key,
          value: '',
          description
        });
      }
      await vscode.commands.executeCommand('flutter-arb-editor.saveArbFile', { arbFile });
    }
  }
}
