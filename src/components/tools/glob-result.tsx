import { Target } from 'lucide-react';
import { GenericToolResult } from './generic-tool-result';

interface GlobResultProps {
  pattern: string;
  path?: string;
  result: string;
}

export function GlobResult({ pattern, path, result }: GlobResultProps) {
  const target = `Pattern: "${pattern}"${path ? ` in ${path}` : ''}`;

  // Count lines to estimate number of files found
  const lineCount = result ? result.split('\n').filter((line) => line.trim()).length : 0;
  const fileCountText = `${lineCount} file${lineCount === 1 ? '' : 's'} found`;

  return (
    <div className="space-y-3">
      <GenericToolResult
        type="glob"
        operation="find"
        success={true}
        target={target}
        message={fileCountText}
      />

      {/* Show file listing if available */}
      {result && (
        <div className="border rounded-lg p-3 bg-white dark:bg-gray-900 dark:border-gray-700">
          <div className="flex items-center gap-2 text-gray-700 border-b pb-2 dark:text-gray-300 dark:border-gray-600">
            <Target className="h-4 w-4" />
            <span className="text-sm font-medium">Found files</span>
          </div>
          <pre className="whitespace-pre-wrap text-xs overflow-auto max-h-48 bg-gray-50 p-2 rounded dark:bg-gray-800 dark:text-gray-300">
            {result}
          </pre>
        </div>
      )}
    </div>
  );
}
