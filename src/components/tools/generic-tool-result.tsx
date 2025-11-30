import { AlertCircle, Check, X } from 'lucide-react';

interface GenericToolResultProps {
  success: boolean;
  operation: string;
  filePath?: string;
  target?: string;
  type?: string;
  content?: string;
  message?: string;
  error?: string;
  details?: string;
}

export function GenericToolResult({
  success,
  operation,
  filePath,
  target,
  type,
  content: _content,
  message,
  error,
  details,
}: GenericToolResultProps) {
  const getOperationText = () => {
    switch (operation) {
      case 'read':
        return type ? `${type.charAt(0).toUpperCase() + type.slice(1)} read` : 'File read';
      case 'write':
        return 'File write';
      case 'edit':
        return 'File edit';
      case 'search':
        return 'Search';
      case 'execute':
        return 'Command execution';
      case 'list':
        return 'File listing';
      case 'find':
        return 'File search';
      case 'call':
        return 'Agent call';
      case 'crawl':
        return 'Web crawl';
      case 'fetch':
        return 'Web fetch';
      case 'update':
        return 'Update';
      case 'skill':
        return 'Skill load';
      default:
        return `${operation.charAt(0).toUpperCase() + operation.slice(1)} operation`;
    }
  };

  // For non-file operations (search, find, fetch, etc.), show target directly
  // For file operations, extract the filename from filePath
  const isFileOperation = ['read', 'write', 'edit', 'list'].includes(operation);
  const fileName =
    isFileOperation && filePath ? filePath.split('/').pop() || filePath : target || filePath;

  if (!success) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg dark:bg-red-950 dark:border-red-800 w-full">
        <div className="flex items-center gap-2 text-red-700 mb-2 dark:text-red-400">
          <X className="h-4 w-4" />
          <span className="font-medium text-sm">{getOperationText()} failed</span>
        </div>
        {fileName && (
          <div className="text-red-600 text-xs font-mono mb-2 dark:text-red-500 break-words">
            {fileName}
          </div>
        )}
        {details && (
          <div className="text-red-500 text-xs mb-2 dark:text-red-600 break-words">{details}</div>
        )}
        {(error || message) && (
          <div className="flex items-start gap-2 text-red-600 text-sm dark:text-red-400">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span className="break-words">{error || message}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 bg-green-50 border border-green-200 rounded-lg dark:bg-green-950 dark:border-green-800 w-full">
      <div className="flex items-center gap-2 text-green-700 mb-2 dark:text-green-400">
        <Check className="h-4 w-4" />
        <span className="font-medium text-sm">{getOperationText()} successful</span>
      </div>
      {fileName && (
        <div className="text-green-600 text-xs font-mono mb-2 dark:text-green-500 break-words">
          {fileName}
        </div>
      )}
      {details && (
        <div className="text-green-500 text-xs mb-2 dark:text-green-600 break-words">{details}</div>
      )}

      {message && (
        <div className="text-green-600 text-sm mb-3 dark:text-green-400 break-words">{message}</div>
      )}
    </div>
  );
}
