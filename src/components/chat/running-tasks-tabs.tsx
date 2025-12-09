// src/components/chat/running-tasks-tabs.tsx
/**
 * RunningTasksTabs - Displays tabs for running tasks with quick switching
 *
 * Features:
 * - Shows all running tasks as tabs
 * - Current task highlighted
 * - Click to switch tasks (doesn't interrupt execution)
 * - Stop button on hover
 * - New chat button when under concurrent limit
 */

import { LoaderCircle, Plus, Square } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/hooks/use-locale';
import { useCanStartNewExecution, useRunningTaskIds } from '@/hooks/use-task';
import { cn } from '@/lib/utils';
import { useTaskStore } from '@/stores/task-store';

interface RunningTasksTabsProps {
  /** Currently displayed task ID */
  currentTaskId?: string;
  /** Callback when user clicks a task tab */
  onSelectTask: (taskId: string) => void;
  /** Callback when user clicks new chat button */
  onNewChat: () => void;
  /** Callback when user clicks stop on a task */
  onStopTask: (taskId: string) => void;
}

/**
 * Single tab for a running task
 */
const TaskTab = memo(function TaskTab({
  taskId,
  title,
  isSelected,
  onSelect,
  onStop,
}: {
  taskId: string;
  title: string;
  isSelected: boolean;
  onSelect: () => void;
  onStop: () => void;
}) {
  return (
    <div
      className={cn(
        'group relative flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors',
        isSelected
          ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300'
          : 'border-border bg-background hover:bg-accent/50'
      )}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
      title={title}
    >
      {/* Running indicator */}
      <LoaderCircle className="h-3 w-3 flex-shrink-0 animate-spin text-blue-500" />

      {/* Title */}
      <span className="max-w-[120px] truncate">{title}</span>

      {/* Stop button - visible on hover */}
      <Button
        className={cn(
          'ml-0.5 h-4 w-4 flex-shrink-0 p-0 transition-opacity',
          'text-muted-foreground hover:text-red-500',
          'opacity-0 group-hover:opacity-100'
        )}
        onClick={(e) => {
          e.stopPropagation();
          onStop();
        }}
        size="sm"
        title="Stop task"
        variant="ghost"
      >
        <Square className="h-2.5 w-2.5" />
      </Button>
    </div>
  );
});

export const RunningTasksTabs = memo(function RunningTasksTabs({
  currentTaskId,
  onSelectTask,
  onNewChat,
  onStopTask,
}: RunningTasksTabsProps) {
  const t = useTranslation();
  const runningTaskIds = useRunningTaskIds();
  const canStartNew = useCanStartNewExecution();

  // Get tasks Map from store
  const tasksMap = useTaskStore(useShallow((state) => state.tasks));

  // Build task info array with memoization
  const runningTasks = useMemo(() => {
    return runningTaskIds.map((taskId) => {
      const task = tasksMap.get(taskId);
      return {
        taskId,
        title: task?.title || 'Untitled',
      };
    });
  }, [runningTaskIds, tasksMap]);

  // Don't render if no running tasks
  if (runningTasks.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5 border-b bg-muted/30 px-3 py-1.5">
      {/* Running tasks tabs */}
      {runningTasks.map(({ taskId, title }) => (
        <TaskTab
          key={taskId}
          isSelected={taskId === currentTaskId}
          onSelect={() => onSelectTask(taskId)}
          onStop={() => onStopTask(taskId)}
          taskId={taskId}
          title={title}
        />
      ))}

      {/* New chat button */}
      <Button
        className="h-6 px-2 text-xs"
        disabled={!canStartNew}
        onClick={onNewChat}
        size="sm"
        title={canStartNew ? t.Common.add : 'Maximum concurrent tasks reached'}
        variant="ghost"
      >
        <Plus className="mr-1 h-3 w-3" />
        {t.Common.add}
      </Button>
    </div>
  );
});
