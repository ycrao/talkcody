// src/services/repository-utils.ts
import { join, normalize } from '@tauri-apps/api/path';

const WINDOWS_PATH_REGEX = /^[a-zA-Z]:\\/;

/**
 * Normalize file path by handling relative paths and path normalization
 * @param rootPath - The root directory path
 * @param filePath - The file path (can be relative or absolute)
 * @returns Normalized absolute file path
 */
export async function normalizeFilePath(rootPath: string, filePath: string): Promise<string> {
  // If filePath is already an absolute path, return it directly
  if (filePath.startsWith('/') || filePath.match(WINDOWS_PATH_REGEX)) {
    return await normalize(filePath);
  }
  // If filePath is relative, join it with rootPath to form absolute path
  filePath = await join(rootPath, filePath);
  // Normalize the path to handle cases like '../' or './'
  return await normalize(filePath);
}

export function getFileNameFromPath(path: string): string {
  return path.split('/').pop() || path.split('\\').pop() || path;
}

export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

export function getFullPath(basePath: string, filePath: string): string {
  // Normalize paths to handle different separators
  const normalizedBasePath = basePath.replace(/\\/g, '/').replace(/\/$/, '');
  const normalizedFilePath = filePath.replace(/\\/g, '/');

  // Check if filePath already contains basePath
  if (
    normalizedFilePath.startsWith(`${normalizedBasePath}/`) ||
    normalizedFilePath === normalizedBasePath
  ) {
    return filePath; // Return original filePath as it already contains full path
  }

  // Check if filePath is an absolute path
  if (normalizedFilePath.startsWith('/') || /^[a-zA-Z]:/.test(normalizedFilePath)) {
    return filePath; // Return as-is if it's already an absolute path
  }

  // Combine basePath with relative filePath
  return `${normalizedBasePath}/${normalizedFilePath.replace(/^\//, '')}`;
}

/**
 * Map file extension to language identifier
 */
export function getLanguageFromExtension(filename: string): string {
  const ext = getFileExtension(filename);
  const languageMap: { [key: string]: string } = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    cpp: 'cpp',
    h: 'cpp',
    c: 'c',
    css: 'css',
    scss: 'scss',
    html: 'html',
    json: 'json',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    sh: 'bash',
    toml: 'toml',
    sql: 'sql',
    graphql: 'graphql',
    vue: 'vue',
    svelte: 'svelte',
  };
  return languageMap[ext] || 'text';
}

export function shouldSkipDirectory(name: string): boolean {
  const skipDirs = [
    'node_modules',
    'target',
    'dist',
    'build',
    '.git',
    '.svn',
    '.hg',
    '.vscode',
    '.idea',
    '__pycache__',
    '.pytest_cache',
    'coverage',
    '.nyc_output',
  ];

  return name.startsWith('.') || skipDirs.includes(name);
}

/**
 * Check if file is a code file based on extension
 */
export function isCodeFile(filename: string): boolean {
  const codeExtensions = [
    'js',
    'jsx',
    'ts',
    'tsx',
    'vue',
    'svelte',
    'py',
    'rs',
    'go',
    'java',
    'cpp',
    'c',
    'h',
    'hpp',
    'css',
    'scss',
    'sass',
    'less',
    'styl',
    'html',
    'htm',
    'xml',
    'svg',
    'json',
    'yaml',
    'yml',
    'toml',
    'ini',
    'cfg',
    'md',
    'mdx',
    'txt',
    'log',
    'sh',
    'bash',
    'zsh',
    'fish',
    'ps1',
    'sql',
    'graphql',
    'proto',
    'dockerfile',
    'makefile',
    'rakefile',
    'rb',
    'php',
    'swift',
    'kt',
    'scala',
    'dart',
    'elm',
    'clj',
    'ex',
    'exs',
  ];

  const ext = getFileExtension(filename);
  const hasValidExtension = codeExtensions.includes(ext);
  const isConfigFile = ['dockerfile', 'makefile', 'rakefile', 'gemfile'].includes(
    filename.toLowerCase()
  );

  return hasValidExtension || isConfigFile;
}

/**
 * Get relative path by removing repository path prefix
 */
export function getRelativePath(fullPath: string, repositoryPath: string): string {
  if (fullPath.startsWith(repositoryPath)) {
    return fullPath.substring(repositoryPath.length + 1);
  }
  return fullPath;
}
