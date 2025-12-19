import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslation } from '@/hooks/use-locale';
import { useExecutionStore } from '@/stores/execution-store';

import { ChatHistory } from './chat-history';
import { ProjectDropdown } from './project-dropdown';
import { ToolbarStats } from './toolbar-stats';

interface ChatToolbarProps {
  currentTaskId?: string;
  onSettingsOpen?: () => void;
  isHistoryOpen: boolean;
  onHistoryOpenChange: (open: boolean) => void;
  onTaskSelect: (taskId: string) => void;
  onNewChat: () => void;
  // Project selector props
  currentProjectId?: string | null;
  onProjectSelect?: (projectId: string) => Promise<void>;
  onImportRepository?: () => Promise<void>;
  isLoadingProject?: boolean;
  rootPath?: string;
}

export function ChatToolbar({
  currentTaskId,
  isHistoryOpen,
  onSettingsOpen: _onSettingsOpen,
  onHistoryOpenChange,
  onTaskSelect,
  onNewChat,
  currentProjectId,
  onProjectSelect,
  onImportRepository,
  isLoadingProject,
}: ChatToolbarProps) {
  const t = useTranslation();
  const isMaxReached = useExecutionStore((state) => state.isMaxReached());

  return (
    <div className="@container flex flex-shrink-0 items-center justify-between gap-2 overflow-hidden border-b bg-gray-50 px-3 py-2 dark:bg-gray-900">
      {/* Left: Project Dropdown */}
      <div className="flex min-w-0 flex-shrink-0 items-center">
        {onProjectSelect && onImportRepository && (
          <ProjectDropdown
            currentProjectId={currentProjectId || null}
            onProjectSelect={onProjectSelect}
            onImportRepository={onImportRepository}
            isLoading={isLoadingProject || false}
          />
        )}
      </div>

      {/* Center: Model, Cost/Tokens, Context */}
      <div className="flex min-w-0 flex-1 items-center justify-center gap-2 overflow-hidden">
        <ToolbarStats />
      </div>

      {/* Right: Actions */}
      <div className="flex flex-shrink-0 items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="h-6 w-6 p-0 hover:bg-gray-200 dark:hover:bg-gray-700"
              disabled={isMaxReached}
              onClick={onNewChat}
              size="sm"
              title={isMaxReached ? 'Maximum concurrent tasks reached' : undefined}
              variant="ghost"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t.Chat.newChat}</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <ChatHistory
                currentTaskId={currentTaskId}
                isOpen={isHistoryOpen}
                onTaskSelect={onTaskSelect}
                onNewChat={onNewChat}
                onOpenChange={onHistoryOpenChange}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t.Chat.chatHistory}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
