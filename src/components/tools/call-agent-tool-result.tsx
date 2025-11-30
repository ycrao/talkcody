import { Bot } from 'lucide-react';
import MyMarkdown from '../chat/my-markdown';

interface CallAgentToolResultProps {
  success: boolean;
  message?: string;
  output?: string;
}

export function CallAgentToolResult({ success, message, output }: CallAgentToolResultProps) {
  const displayOutput = output || message;

  return (
    <div className="space-y-3">
      {success && (
        <div className="border rounded-lg p-3 bg-white dark:bg-gray-900 dark:border-gray-700 w-full">
          <div className="flex items-center gap-2 text-gray-700 border-b pb-2 dark:text-gray-300 dark:border-gray-600">
            <Bot className="h-4 w-4" />
            <span className="text-sm font-medium">Agent Output</span>
          </div>

          <div className="mt-2 space-y-2">
            {displayOutput && (
              <div className="prose prose-neutral dark:prose-invert w-full max-w-none">
                <MyMarkdown content={displayOutput} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
