import { useNestedToolsStore } from '@/stores/nested-tools-store';
import type { UIMessage } from '@/types/agent';
import { GenericToolDoing } from './generic-tool-doing';
import { renderNestedToolsList } from './tool-utils';

// Stable empty array reference to avoid unnecessary re-renders
const EMPTY_MESSAGES: UIMessage[] = [];

type CallAgentToolDoingProps = {
  agentId: string;
  task: string;
  toolCallId?: string;
};

export function CallAgentToolDoing({ agentId, task, toolCallId }: CallAgentToolDoingProps) {
  // Read nested tools from Zustand store using toolCallId
  // Direct state access for proper dependency tracking
  // Use stable EMPTY_MESSAGES reference when no messages exist
  const nestedToolsFromStore = useNestedToolsStore((state): UIMessage[] =>
    toolCallId ? (state.messagesByParent[toolCallId] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES
  );

  return (
    <div className="space-y-3">
      <GenericToolDoing type="agent" operation="call" target={`Agent: ${agentId}`} details={task} />

      {renderNestedToolsList(nestedToolsFromStore, {
        pendingColor: 'purple',
        completedColor: 'green',
      })}
    </div>
  );
}
