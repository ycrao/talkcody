import { Plus, SquareTerminal, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { logger } from '@/lib/logger';
import { modelService } from '@/services/model-service';
import { useAgentExecutionStore } from '@/stores/agent-execution-store';
import { usePlanModeStore } from '@/stores/plan-mode-store';
import { useSettingsStore } from '@/stores/settings-store';
import { ChatHistory } from './chat-history';
import { ProjectDropdown } from './project-dropdown';

// Conversation mode removed - users directly select agents now

interface ChatToolbarProps {
  currentConversationId?: string;
  onSettingsOpen?: () => void;
  isHistoryOpen: boolean;
  onHistoryOpenChange: (open: boolean) => void;
  onConversationSelect: (conversationId: string) => void;
  onNewChat: () => void;
  // Project selector props
  currentProjectId?: string | null;
  onProjectSelect?: (projectId: string) => Promise<void>;
  onImportRepository?: () => Promise<void>;
  isLoadingProject?: boolean;
  rootPath?: string;
  isTerminalVisible?: boolean;
  onToggleTerminal?: () => void;
}

export function ChatToolbar({
  currentConversationId,
  isHistoryOpen,
  onSettingsOpen: _onSettingsOpen,
  onHistoryOpenChange,
  onConversationSelect,
  onNewChat,
  currentProjectId,
  onProjectSelect,
  onImportRepository,
  isLoadingProject,

  rootPath,
  isTerminalVisible,
  onToggleTerminal,
}: ChatToolbarProps) {
  const [modelName, setModelName] = useState<string>('');
  const { isPlanModeEnabled } = usePlanModeStore();
  const { isAgentRunning } = useAgentExecutionStore();

  // Subscribe to settings store for reactive updates
  const {
    model_type_main,
    model_type_small,
    model_type_image_generator,
    model_type_transcription,
    assistantId,
  } = useSettingsStore();

  // Fetch current model identifier
  const updateModelName = useCallback(async () => {
    try {
      const modelIdentifier = await modelService.getCurrentModel();
      setModelName(modelIdentifier || '');
    } catch (error) {
      logger.error('Failed to get current model:', error);
      setModelName('');
    }
  }, []);

  // Update model name when model type settings change
  // biome-ignore lint/correctness/useExhaustiveDependencies: These dependencies trigger re-fetch when model settings change in the store
  useEffect(() => {
    updateModelName();
  }, [
    updateModelName,
    model_type_main,
    model_type_small,
    model_type_image_generator,
    model_type_transcription,
    assistantId,
  ]);

  // Also listen for other events (modelsUpdated, settingsChanged)
  useEffect(() => {
    // Listen for model updates
    const handleModelsUpdate = () => {
      updateModelName();
    };

    // Listen for settings changes (agent changes)
    const handleSettingsChange = () => {
      updateModelName();
    };

    window.addEventListener('modelsUpdated', handleModelsUpdate);
    window.addEventListener('settingsChanged', handleSettingsChange);

    return () => {
      window.removeEventListener('modelsUpdated', handleModelsUpdate);
      window.removeEventListener('settingsChanged', handleSettingsChange);
    };
  }, [updateModelName]);

  return (
    <div className="flex flex-shrink-0 items-center justify-between border-b bg-gray-50 px-3 py-2 dark:bg-gray-900">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        {onProjectSelect && onImportRepository && (
          <>
            <ProjectDropdown
              currentProjectId={currentProjectId || null}
              onProjectSelect={onProjectSelect}
              onImportRepository={onImportRepository}
              isLoading={isLoadingProject || false}
            />
            {rootPath && (
              <div className="flex flex-col">
                <p className="truncate font-medium text-sm" title={rootPath}>
                  {rootPath.split('/').pop()}
                </p>
                <p className="truncate text-gray-500 text-xs">{rootPath}</p>
              </div>
            )}
          </>
        )}
        {modelName && (
          <div className="flex items-center gap-1.5 rounded-md bg-blue-100 px-2 py-1 dark:bg-blue-900/30">
            <span className="font-medium text-blue-700 text-xs dark:text-blue-300">Model:</span>
            <span className="font-medium text-blue-900 text-xs dark:text-blue-100">
              {modelName}
            </span>
          </div>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant={isPlanModeEnabled ? 'default' : 'secondary'} className="text-xs">
              {isPlanModeEnabled ? (
                <>
                  <svg
                    className="mr-1 h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                  Plan Mode
                </>
              ) : (
                <>
                  <Zap className="mr-1 h-3 w-3" />
                  Act Mode
                </>
              )}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              {isPlanModeEnabled
                ? 'AI will create a detailed plan for your approval before making changes'
                : 'AI will execute tasks directly without requiring plan approval'}
            </p>
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="flex items-center gap-1">
        {onToggleTerminal && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className={`h-6 w-6 p-0 hover:bg-gray-200 dark:hover:bg-gray-700 ${
                  isTerminalVisible ? 'bg-gray-200 dark:bg-gray-700' : ''
                }`}
                onClick={onToggleTerminal}
                size="sm"
                variant="ghost"
              >
                <SquareTerminal className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Toggle Terminal</p>
            </TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="h-6 w-6 p-0 hover:bg-gray-200 dark:hover:bg-gray-700"
              disabled={isAgentRunning}
              onClick={onNewChat}
              size="sm"
              variant="ghost"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>New Chat</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <ChatHistory
                currentConversationId={currentConversationId}
                isOpen={isHistoryOpen}
                onConversationSelect={onConversationSelect}
                onNewChat={onNewChat}
                onOpenChange={onHistoryOpenChange}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Chat History</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
