/**
 * Represents a localization key-value pair in an ARB file
 */
export interface ArbEntry {
  key: string;
  value: string;
  description?: string;
  placeholders?: Record<string, ArbPlaceholder>;
}

/**
 * Represents a placeholder in an ARB entry
 */
export interface ArbPlaceholder {
  type?: string;
  format?: string;
  example?: string;
  description?: string;
}

/**
 * Represents an ARB file with its locale and entries
 */
export interface ArbFile {
  uri: string;
  locale: string;
  fileName: string;
  entries: ArbEntry[];
  metadata?: {
    lastModified: Date;
//    ' @@locale?': string;
//     '@@context?': string;
    [key: string]: any;
  };
}

/**
 * Represents the tree structure of ARB files in the workspace
 */
export interface ArbFilesTree {
  projectPath: string;
  files: ArbFile[];
}
