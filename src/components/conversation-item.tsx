import { Calendar, Edit2, Hash, MoreVertical, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { formatDate } from '@/lib/utils';
// Conversation mode removed - users directly select agents now
import type { Conversation } from '@/services/database-service';

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  isEditing: boolean;
  editingTitle: string;
  onSelect: (conversationId: string) => void;
  onDelete: (conversationId: string, e?: React.MouseEvent) => void;
  onStartEditing: (conversation: Conversation, e?: React.MouseEvent) => void;
  onSaveEdit: (conversationId: string) => void;
  onCancelEdit: () => void;
  onTitleChange: (title: string) => void;
}

export function ConversationItem({
  conversation,
  isSelected,
  isEditing,
  editingTitle,
  onSelect,
  onDelete,
  onStartEditing,
  onSaveEdit,
  onCancelEdit,
  onTitleChange,
}: ConversationItemProps) {
  const displayTitle = (conversation.title || '').trim() || 'New Conversation';

  if (isEditing) {
    return (
      <div
        className={`w-full cursor-pointer rounded-md border bg-background p-3 text-left hover:bg-accent/50 ${isSelected ? 'border-blue-200 bg-blue-50 dark:border-blue-600 dark:bg-blue-950' : 'border-border'}
                `}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
          }
        }}
      >
        <div className="space-y-2">
          <Input
            autoFocus
            className="h-7 text-sm"
            onChange={(e) => onTitleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onSaveEdit(conversation.id);
              } else if (e.key === 'Escape') {
                onCancelEdit();
              }
            }}
            placeholder="Enter conversation title"
            value={editingTitle}
          />
          <div className="flex gap-1">
            <Button
              className="h-6 px-2 text-xs"
              onClick={() => onSaveEdit(conversation.id)}
              size="sm"
              variant="outline"
            >
              Save
            </Button>
            <Button className="h-6 px-2 text-xs" onClick={onCancelEdit} size="sm" variant="ghost">
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group w-full cursor-pointer rounded-md border bg-background p-3 text-left hover:bg-accent/50 ${isSelected ? 'border-blue-200 bg-blue-50 dark:border-blue-600 dark:bg-blue-950' : 'border-border'}
            `}
      onClick={() => onSelect(conversation.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(conversation.id);
        }
      }}
      role="button"
      tabIndex={0}
      title={displayTitle}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h5 className="mb-1 line-clamp-2 font-medium text-sm">{displayTitle}</h5>
          <div className="flex items-center gap-3 text-muted-foreground text-xs">
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>{formatDate(conversation.updated_at)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              <span>{conversation.message_count}</span>
            </div>
          </div>
        </div>

        <div className="flex-shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className={`h-6 w-6 p-0 transition-all duration-200 ${
                  isSelected
                    ? 'text-muted-foreground opacity-100'
                    : 'text-muted-foreground/60 opacity-0 hover:text-muted-foreground group-hover:opacity-100'
                }
                                `}
                onClick={(e) => e.stopPropagation()}
                size="sm"
                variant="ghost"
              >
                <MoreVertical className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              <DropdownMenuItem
                className="flex cursor-pointer items-center gap-2"
                onClick={(e) => onStartEditing(conversation, e)}
              >
                <Edit2 className="h-3 w-3" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                className="flex cursor-pointer items-center gap-2 text-red-600 focus:text-red-600"
                onClick={(e) => onDelete(conversation.id, e)}
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
