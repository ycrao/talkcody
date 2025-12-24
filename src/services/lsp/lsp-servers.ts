// src/services/lsp/lsp-servers.ts
// LSP server configurations for different languages

export interface LspServerConfig {
  /** Display name for the server */
  name: string;
  /** Language ID used by LSP */
  languageId: string;
  /** File extensions this server handles */
  extensions: string[];
  /** Command to start the server */
  command: string;
  /** Command line arguments */
  args: string[];
  /** Root file patterns to detect project root */
  rootPatterns: string[];
}

/**
 * LSP server configurations for supported languages
 */
export const LSP_SERVERS: Record<string, LspServerConfig> = {
  typescript: {
    name: 'TypeScript Language Server',
    languageId: 'typescript',
    extensions: ['.ts', '.tsx'],
    command: 'typescript-language-server',
    args: ['--stdio'],
    rootPatterns: ['tsconfig.json', 'package.json'],
  },
  javascript: {
    name: 'TypeScript Language Server (JavaScript)',
    languageId: 'javascript',
    extensions: ['.js', '.jsx', '.mjs', '.cjs'],
    command: 'typescript-language-server',
    args: ['--stdio'],
    rootPatterns: ['jsconfig.json', 'package.json'],
  },
  rust: {
    name: 'rust-analyzer',
    languageId: 'rust',
    extensions: ['.rs'],
    command: 'rust-analyzer',
    args: [],
    rootPatterns: ['Cargo.toml'],
  },
  python: {
    name: 'Pyright',
    languageId: 'python',
    extensions: ['.py', '.pyi'],
    command: 'pyright-langserver',
    args: ['--stdio'],
    rootPatterns: ['pyproject.toml', 'setup.py', 'requirements.txt'],
  },
  go: {
    name: 'gopls',
    languageId: 'go',
    extensions: ['.go'],
    command: 'gopls',
    args: [],
    rootPatterns: ['go.mod', 'go.sum'],
  },
  c: {
    name: 'clangd',
    languageId: 'c',
    extensions: ['.c', '.h'],
    command: 'clangd',
    args: [],
    rootPatterns: ['compile_commands.json', 'CMakeLists.txt', 'Makefile'],
  },
  cpp: {
    name: 'clangd',
    languageId: 'cpp',
    extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx'],
    command: 'clangd',
    args: [],
    rootPatterns: ['compile_commands.json', 'CMakeLists.txt', 'Makefile'],
  },
};

/**
 * Get the language ID for a file extension
 */
export function getLanguageIdForExtension(extension: string): string | null {
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  for (const [lang, config] of Object.entries(LSP_SERVERS)) {
    if (config.extensions.includes(ext)) {
      return lang;
    }
  }
  return null;
}

/**
 * Get the language ID for a file path
 */
export function getLanguageIdForPath(filePath: string): string | null {
  const ext = filePath.substring(filePath.lastIndexOf('.'));
  return getLanguageIdForExtension(ext);
}

/**
 * Get the LSP server config for a language
 */
export function getServerConfig(language: string): LspServerConfig | null {
  return LSP_SERVERS[language] || null;
}

/**
 * Check if a language has LSP support
 */
export function hasLspSupport(language: string): boolean {
  return language in LSP_SERVERS;
}

/**
 * Get all supported languages
 */
export function getSupportedLanguages(): string[] {
  return Object.keys(LSP_SERVERS);
}

/**
 * Map Monaco language ID to LSP language ID
 */
export function monacoToLspLanguage(monacoLanguage: string): string | null {
  const mapping: Record<string, string> = {
    typescript: 'typescript',
    typescriptreact: 'typescript',
    javascript: 'javascript',
    javascriptreact: 'javascript',
    rust: 'rust',
    python: 'python',
    go: 'go',
    c: 'c',
    cpp: 'cpp',
  };
  return mapping[monacoLanguage] || null;
}
