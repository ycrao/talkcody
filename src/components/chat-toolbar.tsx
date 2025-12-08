import { ArrowDown, ArrowUp, FileSearch, Plus, Search, SquareTerminal, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTranslation } from '@/hooks/use-locale';
import { logger } from '@/lib/logger';
import { modelService } from '@/services/model-service';
import { useConversationUsageStore } from '@/stores/conversation-usage-store';
import { usePlanModeStore } from '@/stores/plan-mode-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useTaskExecutionStore } from '@/stores/task-execution-store';
import { ChatHistory } from './chat-history';
import { ProjectDropdown } from './project-dropdown';

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
  // Search props
  onOpenFileSearch?: () => void;
  onOpenContentSearch?: () => void;
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
  isTerminalVisible,
  onToggleTerminal,
  onOpenFileSearch,
  onOpenContentSearch,
}: ChatToolbarProps) {
  const t = useTranslation();
  const [modelName, setModelName] = useState<string>('');
  const { isPlanModeEnabled } = usePlanModeStore();
  const isMaxReached = useTaskExecutionStore((state) => state.isMaxReached());
  const { cost, inputTokens, outputTokens, contextUsage } = useConversationUsageStore();

  const formatTokens = (tokens: number): string => {
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}k`;
    }
    return tokens.toString();
  };

  const formatCost = (costValue: number): string => {
    return `$${costValue.toFixed(4)}`;
  };

  const getContextUsageColor = (usage: number): string => {
    if (usage >= 90) return 'text-red-600 dark:text-red-400';
    if (usage >= 70) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-emerald-600 dark:text-emerald-400';
  };

  const getContextUsageBgColor = (usage: number): string => {
    if (usage >= 90) return 'bg-red-100 dark:bg-red-900/30';
    if (usage >= 70) return 'bg-yellow-100 dark:bg-yellow-900/30';
    return 'bg-emerald-100 dark:bg-emerald-900/30';
  };

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
      {/* Left: Project Dropdown */}
      <div className="flex min-w-0 flex-1 items-center">
        {onProjectSelect && onImportRepository && (
          <ProjectDropdown
            currentProjectId={currentProjectId || null}
            onProjectSelect={onProjectSelect}
            onImportRepository={onImportRepository}
            isLoading={isLoadingProject || false}
          />
        )}
      </div>

      {/* Center: Model, Plan Mode, Cost/Tokens */}
      <div className="flex items-center justify-center gap-3">
        {modelName && (
          <div className="flex items-center gap-1.5 rounded-md bg-blue-100 px-2 py-1 dark:bg-blue-900/30">
            <span className="font-medium text-blue-700 text-xs dark:text-blue-300">
              {t.Chat.toolbar.model}:
            </span>
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
                  {t.Chat.toolbar.planMode}
                </>
              ) : (
                <>
                  <Zap className="mr-1 h-3 w-3" />
                  {t.Chat.toolbar.actMode}
                </>
              )}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              {isPlanModeEnabled ? t.Chat.toolbar.planModeTooltip : t.Chat.toolbar.actModeTooltip}
            </p>
          </TooltipContent>
        </Tooltip>

        {(cost > 0 || inputTokens > 0 || outputTokens > 0) && (
          <div className="flex items-center gap-1.5 rounded-md bg-emerald-100 px-2 py-1 dark:bg-emerald-900/30">
            <span className="font-medium text-emerald-700 text-xs dark:text-emerald-300">
              {formatCost(cost)}
            </span>
            <span className="flex items-center text-emerald-600 text-xs dark:text-emerald-400">
              <ArrowUp className="h-3 w-3" />
              {formatTokens(inputTokens)} {t.Chat.toolbar.inputTokens}
            </span>
            <span className="flex items-center text-emerald-600 text-xs dark:text-emerald-400">
              <ArrowDown className="h-3 w-3" />
              {formatTokens(outputTokens)} {t.Chat.toolbar.outputTokens}
            </span>
          </div>
        )}

        {contextUsage > 0 && (
          <div
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 ${getContextUsageBgColor(contextUsage)}`}
          >
            <span className={`font-medium text-xs ${getContextUsageColor(contextUsage)}`}>
              Context: {contextUsage.toFixed(0)}%
            </span>
          </div>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
        {/* Search buttons */}
        {onOpenFileSearch && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className="h-6 w-6 p-0 hover:bg-gray-200 dark:hover:bg-gray-700"
                onClick={onOpenFileSearch}
                size="sm"
                variant="ghost"
              >
                <FileSearch className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t.Chat.toolbar.searchFiles}</p>
            </TooltipContent>
          </Tooltip>
        )}
        {onOpenContentSearch && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className="h-6 w-6 p-0 hover:bg-gray-200 dark:hover:bg-gray-700"
                onClick={onOpenContentSearch}
                size="sm"
                variant="ghost"
              >
                <Search className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t.Chat.toolbar.searchContent}</p>
            </TooltipContent>
          </Tooltip>
        )}
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
              <p>{t.Chat.toolbar.toggleTerminal}</p>
            </TooltipContent>
          </Tooltip>
        )}
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
                currentConversationId={currentConversationId}
                isOpen={isHistoryOpen}
                onConversationSelect={onConversationSelect}
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
