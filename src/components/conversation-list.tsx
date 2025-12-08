import { MessageSquare } from 'lucide-react';
import type { Conversation } from '@/services/database-service';
import { ConversationItem } from './conversation-item';

interface ConversationListProps {
  conversations: Conversation[];
  currentConversationId?: string;
  loading: boolean;
  editingId: string | null;
  editingTitle: string;
  /** IDs of currently running tasks/conversations */
  runningTaskIds?: string[];
  onConversationSelect: (conversationId: string) => void;
  onDeleteConversation: (conversationId: string, e?: React.MouseEvent) => void;
  onStartEditing: (conversation: Conversation, e?: React.MouseEvent) => void;
  onSaveEdit: (conversationId: string) => void;
  onCancelEdit: () => void;
  onTitleChange: (title: string) => void;
}

export function ConversationList({
  conversations,
  currentConversationId,
  loading,
  editingId,
  editingTitle,
  runningTaskIds = [],
  onConversationSelect,
  onDeleteConversation,
  onStartEditing,
  onSaveEdit,
  onCancelEdit,
  onTitleChange,
}: ConversationListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-12 text-muted-foreground">
        <MessageSquare className="mb-3 h-12 w-12 text-muted-foreground/30" />
        <div className="text-center">
          <p className="mb-1 font-medium text-sm">No conversations yet</p>
          <p className="text-muted-foreground/60 text-xs">Start a new chat to begin!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-1">
      {conversations.map((conversation) => (
        <div className="mb-1" key={conversation.id}>
          <ConversationItem
            conversation={conversation}
            editingTitle={editingTitle}
            isEditing={editingId === conversation.id}
            isRunning={runningTaskIds.includes(conversation.id)}
            isSelected={currentConversationId === conversation.id}
            onCancelEdit={onCancelEdit}
            onDelete={onDeleteConversation}
            onSaveEdit={onSaveEdit}
            onSelect={onConversationSelect}
            onStartEditing={onStartEditing}
            onTitleChange={onTitleChange}
          />
        </div>
      ))}
    </div>
  );
}
