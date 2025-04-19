import * as fs from 'fs-extra';
import * as path from 'path';
import * as vscode from 'vscode';
import * as xlsx from 'xlsx';
import { ArbEntry, ArbFile } from '../models/arbModels';

/**
 * Utility functions for exporting ARB files to Excel
 */
export class ExcelExporter {
  /**
   * Export ARB files to Excel
   * @param arbFiles The ARB files to export
   * @returns The path to the exported Excel file
   */
  public static async exportToExcel(arbFiles: ArbFile[]): Promise<string | undefined> {
    try {
      if (!arbFiles || arbFiles.length === 0) {
        throw new Error('No ARB files to export');
      }

      // Create a new workbook
      const workbook = xlsx.utils.book_new();
      
      // Collect all unique keys across all ARB files
      const allKeys = new Set<string>();
      arbFiles.forEach(file => {
        file.entries.forEach(entry => {
          allKeys.add(entry.key);
        });
      });
      
      // Sort keys alphabetically
      const sortedKeys = Array.from(allKeys).sort();
      
      // Create the worksheet data
      const worksheetData: any[] = [];
      
      // Add header row with key, description, and locale columns
      const headerRow: any = { key: 'Key', description: 'Description' };
      arbFiles.forEach(file => {
        headerRow[file.locale] = file.locale;
      });
      worksheetData.push(headerRow);
      
      // Add data rows
      sortedKeys.forEach(key => {
        const row: any = { key };
        
        // Find the first entry with this key to get the description
        for (const file of arbFiles) {
          const entry = file.entries.find(e => e.key === key);
          if (entry && entry.description) {
            row.description = entry.description;
            break;
          }
        }
        
        if (!row.description) {
          row.description = '';
        }
        
        // Add values for each locale
        arbFiles.forEach(file => {
          const entry = file.entries.find(e => e.key === key);
          row[file.locale] = entry ? entry.value : '';
        });
        
        worksheetData.push(row);
      });
      
      // Create the worksheet
      const worksheet = xlsx.utils.json_to_sheet(worksheetData, {
        header: ['key', 'description', ...arbFiles.map(file => file.locale)]
      });
      
      // Add the worksheet to the workbook
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Translations');
      
      // Ask the user where to save the Excel file
      const defaultPath = path.join(path.dirname(arbFiles[0].uri), 'translations.xlsx');
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(defaultPath),
        filters: {
          'Excel Files': ['xlsx']
        }
      });
      
      if (!uri) {
        return undefined;
      }
      
      // Write the workbook to the file
      const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      await fs.writeFile(uri.fsPath, buffer);
      
      return uri.fsPath;
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      throw error;
    }
  }
}

/**
 * Utility functions for importing ARB files from Excel
 */
export class ExcelImporter {
  /**
   * Import ARB files from Excel
   * @param arbFiles The ARB files to update
   * @returns The updated ARB files
   */
  public static async importFromExcel(arbFiles: ArbFile[]): Promise<ArbFile[]> {
    try {
      if (!arbFiles || arbFiles.length === 0) {
        throw new Error('No ARB files to update');
      }
      
      // Ask the user to select an Excel file
      const uris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          'Excel Files': ['xlsx', 'xls']
        }
      });
      
      if (!uris || uris.length === 0) {
        return arbFiles;
      }
      
      const excelFilePath = uris[0].fsPath;
      
      // Read the Excel file
      const workbook = xlsx.readFile(excelFilePath);
      
      // Get the first worksheet
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert the worksheet to JSON
      const data = xlsx.utils.sheet_to_json(worksheet);
      
      if (data.length === 0) {
        throw new Error('No data found in the Excel file');
      }
      
      // Get the available locales in the Excel file
      const firstRow = data[0] as any;
      const excelLocales = Object.keys(firstRow).filter(key => 
        key !== 'key' && key !== 'Key' && 
        key !== 'description' && key !== 'Description'
      );
      
      // Match Excel locales with ARB files
      const localeMapping: Record<string, ArbFile> = {};
      
      for (const locale of excelLocales) {
        const matchingFile = arbFiles.find(file => file.locale === locale);
        if (matchingFile) {
          localeMapping[locale] = matchingFile;
        }
      }
      
      // Confirm import with the user
      const matchedLocales = Object.keys(localeMapping);
      if (matchedLocales.length === 0) {
        throw new Error('No matching locales found between Excel and ARB files');
      }
      
      const confirmation = await vscode.window.showInformationMessage(
        `Found ${matchedLocales.length} matching locales: ${matchedLocales.join(', ')}. Import?`,
        { modal: true },
        'Yes',
        'No'
      );
      
      if (confirmation !== 'Yes') {
        return arbFiles;
      }
      
      // Import the data
      const keyField = 'key' in firstRow ? 'key' : 'Key';
      const descriptionField = 'description' in firstRow ? 'description' : 'Description';
      
      // Create a map of existing entries by key for each ARB file
      const existingEntriesMap = new Map<string, Map<string, ArbEntry>>();
      
      for (const file of arbFiles) {
        const entriesMap = new Map<string, ArbEntry>();
        file.entries.forEach(entry => {
          entriesMap.set(entry.key, entry);
        });
        existingEntriesMap.set(file.locale, entriesMap);
      }
      
      // Process each row in the Excel file
      for (const row of data) {
        const rowData = row as any;
        const key = rowData[keyField];
        const description = rowData[descriptionField] || '';
        
        if (!key) {
          continue;
        }
        
        // Update each matched ARB file
        for (const locale of matchedLocales) {
          const value = rowData[locale] || '';
          const arbFile = localeMapping[locale];
          const entriesMap = existingEntriesMap.get(locale);
          
          if (!entriesMap) {
            continue;
          }
          
          const existingEntry = entriesMap.get(key);
          
          if (existingEntry) {
            // Update existing entry
            existingEntry.value = value;
            existingEntry.description = description;
          } else {
            // Add new entry
            const newEntry: ArbEntry = {
              key,
              value,
              description: description || undefined
            };
            
            arbFile.entries.push(newEntry);
            entriesMap.set(key, newEntry);
          }
        }
      }
      
      return arbFiles;
    } catch (error) {
      console.error('Error importing from Excel:', error);
      throw error;
    }
  }
}

/**
 * Utility functions for generating i18n code
 */
export class I18nGenerator {
  /**
   * Generate i18n code for Flutter
   * @param arbFiles The ARB files to generate code from
   * @returns The path to the generated code
   */
  public static async generateI18nCode(arbFiles: ArbFile[]): Promise<string | undefined> {
    try {
      if (!arbFiles || arbFiles.length === 0) {
        throw new Error('No ARB files to generate code from');
      }
      
      // Ask the user to select an output directory
      const config = vscode.workspace.getConfiguration('flutterArbEditor');
      const defaultOutputDir = config.get<string>('defaultI18nOutputDir', 'lib/generated');
      
      // Try to determine project root
      const projectRoot = path.dirname(path.dirname(arbFiles[0].uri));
      const defaultOutputPath = path.join(projectRoot, defaultOutputDir);
      
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(defaultOutputPath, 'l10n.dart')),
        filters: {
          'Dart Files': ['dart']
        },
        saveLabel: 'Generate'
      });
      
      if (!uri) {
        return undefined;
      }
      
      // Make sure the directory exists
      await fs.ensureDir(path.dirname(uri.fsPath));
      
      // Get all unique keys and sort them
      const allKeys = new Set<string>();
      arbFiles.forEach(file => {
        file.entries.forEach(entry => {
          allKeys.add(entry.key);
        });
      });
      
      const sortedKeys = Array.from(allKeys).sort();
      
      // Generate delegate class code
      const delegateClassName = 'AppLocalizations';
      const delegateCode = I18nGenerator.generateDelegateCode(delegateClassName, arbFiles);
      
      // Generate localization class code
      const localizationsCode = I18nGenerator.generateLocalizationsCode(
        delegateClassName,
        sortedKeys,
        arbFiles
      );
      
      // Combine the code
      const code = `
// GENERATED CODE - DO NOT MODIFY BY HAND
// This file was generated by flutter_arb_editor

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart';

${delegateCode}

${localizationsCode}
`;
      
      // Write the code to the file
      await fs.writeFile(uri.fsPath, code);
      
      return uri.fsPath;
    } catch (error) {
      console.error('Error generating i18n code:', error);
      throw error;
    }
  }
  
  /**
   * Generate delegate class code
   */  private static generateDelegateCode(
    className: string,
    arbFiles: ArbFile[]
  ): string {
    const supportedLocales = arbFiles.map(file => {
      const [language, country] = file.locale.split('_');
      return country
        ? `Locale('${language}', '${country}')`
        : `Locale('${language}')`;
    });
    
    return `
/// Callers can lookup localized strings with an instance of ${className} returned
/// by \`${className}.of(context)\`.
///
/// Applications need to include \`${className}.delegate\` in their app's
/// localizationDelegates list, and the locales they support in the app's
/// supportedLocales list.
abstract class ${className} {
  ${className}(this.localeName);
  
  final String localeName;
  
  static ${className} of(BuildContext context) {
    return Localizations.of<${className}>(context, ${className})!;
  }
  
  static const LocalizationsDelegate<${className}> delegate = _${className}Delegate();
  
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates = <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
  ];
  
  static const List<Locale> supportedLocales = <Locale>[
    ${supportedLocales.join(',\n    ')}
  ];
}

class _${className}Delegate extends LocalizationsDelegate<${className}> {
  const _${className}Delegate();

  @override
  Future<${className}> load(Locale locale) {
    return SynchronousFuture<${className}>(_lookup${className}(locale));
  }

  @override
  bool isSupported(Locale locale) => <String>[
    ${arbFiles.map(file => `'${file.locale.split('_')[0]}'`).join(',\n    ')}
  ].contains(locale.languageCode);

  @override
  bool shouldReload(_${className}Delegate old) => false;
}

${className} _lookup${className}(Locale locale) {
  ${arbFiles.map((file, index) => {
    const [language, country] = file.locale.split('_');
    if (country) {
      return `if (locale.languageCode == '${language}' && locale.countryCode == '${country}') return ${className}${file.locale.toUpperCase()}();`;
    } else {
      return `if (locale.languageCode == '${language}') return ${className}${file.locale.toUpperCase()}();`;
    }
  }).join('\n  ')}
  
  throw FlutterError(
    '${className}.delegate failed to load unsupported locale "\$locale". This is likely '
    'an issue with the app\'s localization configuration.'
  );
}`;
  }
  
  /**
   * Generate localizations class code
   */
  private static generateLocalizationsCode(
    className: string,
    keys: string[],
    arbFiles: ArbFile[]
  ): string {
    const baseClass = `
/// The translations for the base locale.
abstract class ${className}Base extends ${className} {
  ${className}Base(super.localeName);
  
${keys.map(key => {
  // Find an entry with a description for this key
  let description = '';
  for (const file of arbFiles) {
    const entry = file.entries.find(e => e.key === key);
    if (entry && entry.description) {
      description = entry.description;
      break;
    }
  }

  const descriptionComment = description ? `  /// ${description}\n` : '';
  
  // Find placeholders
  let placeholders: Record<string, any> = {};
  for (const file of arbFiles) {
    const entry = file.entries.find(e => e.key === key);
    if (entry && entry.placeholders) {
      placeholders = entry.placeholders;
      break;
    }
  }
  
  const hasPlaceholders = Object.keys(placeholders).length > 0;
  
  if (hasPlaceholders) {
    const params = Object.keys(placeholders).map(placeholder => 
      `required ${placeholders[placeholder].type || 'Object'} ${placeholder}`
    ).join(', ');
    
    return `${descriptionComment}  String ${key}({${params}});`;
  } else {
    return `${descriptionComment}  String get ${key};`;
  }
}).join('\n\n')}
}`;
    
    const localeClasses = arbFiles.map(file => {
      const className_ = `${className}${file.locale.toUpperCase()}`;
      const baseClassName = `${className}Base`;
      
      return `
/// The translations for ${file.locale}.
class ${className_} extends ${baseClassName} {
  ${className_}() : super('${file.locale}');
  
${keys.map(key => {
  const entry = file.entries.find(e => e.key === key);
  
  if (!entry) {
    // If the key doesn't exist in this locale file, add a TODO
    return `  @override\n  String get ${key} => 'TODO';`;
  }
  
  // Find placeholders if any
  let placeholders: Record<string, any> = {};
  if (entry.placeholders) {
    placeholders = entry.placeholders;
  }
  
  const hasPlaceholders = Object.keys(placeholders).length > 0;
  
  if (hasPlaceholders) {
    const params = Object.keys(placeholders).map(placeholder => 
      `required ${placeholders[placeholder].type || 'Object'} ${placeholder}`
    ).join(', ');
    
    // Replace placeholders in the value
    let valueWithParams = entry.value;
    Object.keys(placeholders).forEach(placeholder => {
      valueWithParams = valueWithParams.replace(
        new RegExp(`\\{${placeholder}\\}`, 'g'),
        '\$${placeholder}'
      );
    });
    
    return `  @override\n  String ${key}({${params}}) => "${valueWithParams}";`;
  } else {
    // Escape double quotes
    const escapedValue = entry.value.replace(/"/g, '\\"');
    return `  @override\n  String get ${key} => "${escapedValue}";`;
  }
}).join('\n\n')}
}`;
    }).join('\n\n');
    
    return `${baseClass}\n\n${localeClasses}`;
  }
}
