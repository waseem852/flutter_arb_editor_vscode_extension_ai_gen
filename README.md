# Flutter ARB Editor

A VS Code extension for managing Flutter ARB (Application Resource Bundle) files with a visual editor. This extension helps Flutter developers streamline the localization workflow by providing a convenient way to edit, compare, and manage ARB files.

## Features

- **Auto-detect ARB files** - Automatically finds ARB files in your Flutter project
- **Visual Grid Editor** - Edit translations in a user-friendly grid interface
- **Excel Import/Export** - Share translations with non-technical team members via Excel
- **i18n Code Generation** - Generate Flutter localization code from your ARB files
- **Tree View** - Browse and manage your ARB files in the VS Code Explorer
- **Multi-locale Support** - Compare and edit translations for multiple locales simultaneously

## Usage

### Opening the ARB Editor

There are several ways to open the ARB Editor:

1. Right-click on an ARB file in the Explorer and select "Open ARB Editor"
2. Click on the ARB file in the "Flutter ARB Files" view in the Explorer
3. Use the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) and run "Flutter ARB Editor: Open ARB Editor"

### Managing Translations

- **Add a translation**: Click the "Add New Entry" button in the editor
- **Edit a translation**: Simply modify the text in the value field
- **Delete a translation**: Click the "Delete" button next to the entry

### Import/Export with Excel

- **Export to Excel**: Click the "Export to Excel" button in the editor
- **Import from Excel**: Click the "Import from Excel" button in the editor

### Generate i18n Code

Click the "Generate i18n" button to create Flutter localization code from your ARB files.

## Extension Settings

This extension contributes the following settings:

* `flutterArbEditor.autoDetectArbFiles`: Enable/disable automatic detection of ARB files
* `flutterArbEditor.arbFilesPattern`: Glob pattern to search for ARB files (default: "**/l10n/**/*.arb")
* `flutterArbEditor.showTreeView`: Show/hide the ARB files tree view
* `flutterArbEditor.defaultI18nOutputDir`: Default output directory for generated i18n code

## Requirements

- VS Code 1.60.0 or higher
- A Flutter project with ARB files for localization

## About ARB Files

ARB (Application Resource Bundle) files are used in Flutter for internationalization. They contain key-value pairs for translating text in your application to different languages.

For more information on Flutter localization, see the [Flutter Internationalization Guide](https://docs.flutter.dev/ui/accessibility-and-localization/internationalization).

## License

This extension is licensed under the MIT License.

Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of ...

### 1.0.1

Fixed issue #.

### 1.1.0

Added features X, Y, and Z.

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
