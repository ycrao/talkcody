import { History, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useConversations } from '@/hooks/use-conversations';
import { useTranslation } from '@/hooks/use-locale';
import { useTaskExecutionStore } from '@/stores/task-execution-store';
import { ConversationList } from './conversation-list';

interface ChatHistoryProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  currentConversationId?: string;
  onConversationSelect: (conversationId: string) => void;
  onNewChat: () => void;
}

export function ChatHistory({
  isOpen,
  onOpenChange,
  currentConversationId,
  onConversationSelect,
  onNewChat,
}: ChatHistoryProps) {
  const t = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  // Use selectors to avoid re-rendering on every streaming chunk
  const runningTaskIds = useTaskExecutionStore(useShallow((state) => state.getRunningTaskIds()));
  const isMaxReached = useTaskExecutionStore((state) => state.isMaxReached());

  const {
    conversations,
    loading,
    editingId,
    editingTitle,
    setEditingTitle,
    loadConversations,
    deleteConversation,
    finishEditing,
    startEditing,
    cancelEditing,
    selectConversation,
  } = useConversations();

  // Refresh conversations when history opens or active conversation changes
  useEffect(() => {
    if (isOpen) {
      loadConversations();
    }
  }, [isOpen, loadConversations]);

  const handleConversationSelect = (conversationId: string) => {
    selectConversation(conversationId);
    onConversationSelect(conversationId);
    onOpenChange(false);
  };

  const handleNewChat = () => {
    onNewChat();
    onOpenChange(false);
  };

  const filteredConversations = conversations.filter((conv) =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Popover onOpenChange={onOpenChange} open={isOpen}>
      <PopoverTrigger asChild>
        <Button
          className="h-6 w-6 p-0 hover:bg-gray-200 dark:hover:bg-gray-700"
          size="sm"
          title={t.Chat.chatHistory}
          variant="ghost"
        >
          <History className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex h-96 flex-col">
          {/* Search Header */}
          <div className="border-b p-3">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="font-medium text-sm">{t.Chat.chatHistory}</h4>
              <Button
                className="h-6 px-2 text-xs"
                disabled={isMaxReached}
                onClick={handleNewChat}
                size="sm"
                title={isMaxReached ? 'Maximum concurrent tasks reached' : undefined}
                variant="ghost"
              >
                <Plus className="mr-1 h-3 w-3" />
                {t.Common.add}
              </Button>
            </div>
            <div className="relative">
              <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 transform text-gray-400" />
              <Input
                className="h-8 pl-9"
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.Chat.searchConversations}
                value={searchQuery}
              />
            </div>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-auto">
            <ConversationList
              conversations={filteredConversations}
              currentConversationId={currentConversationId}
              editingId={editingId}
              editingTitle={editingTitle}
              loading={loading}
              onCancelEdit={cancelEditing}
              onConversationSelect={handleConversationSelect}
              onDeleteConversation={deleteConversation}
              onSaveEdit={finishEditing}
              onStartEditing={startEditing}
              onTitleChange={setEditingTitle}
              runningTaskIds={runningTaskIds}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
