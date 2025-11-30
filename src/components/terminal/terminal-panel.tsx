import { Copy, MessageSquare, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';
import { terminalService } from '@/services/terminal-service';
import { useRepositoryStore } from '@/stores/repository-store';
import { useTerminalStore } from '@/stores/terminal-store';
import { Terminal } from './terminal';
import { TerminalTabs } from './terminal-tabs';

interface TerminalPanelProps {
  onCopyToChat?: (content: string) => void;
  onClose?: () => void;
}

export function TerminalPanel({ onCopyToChat, onClose }: TerminalPanelProps) {
  const activeSessionId = useTerminalStore((state) => state.activeSessionId);
  const sessions = useTerminalStore((state) => state.sessions);
  const rootPath = useRepositoryStore((state) => state.rootPath);
  const isCreatingTerminal = useRef(false);

  // // Get active session from the Map
  // const activeSession = activeSessionId ? sessions.get(activeSessionId) : undefined;

  // Note: Terminal service is now initialized in initialization-manager.ts
  // Cleanup is handled when the app closes, not when this component unmounts

  useEffect(() => {
    // Create initial terminal if none exist
    if (sessions.size === 0 && !isCreatingTerminal.current) {
      logger.info('Creating initial terminal', {
        sessionsSize: sessions.size,
        rootPath,
        isCreating: isCreatingTerminal.current,
      });
      isCreatingTerminal.current = true;
      terminalService
        .createTerminal(rootPath || undefined)
        .catch((error) => {
          logger.error('Failed to create initial terminal', error);
        })
        .finally(() => {
          isCreatingTerminal.current = false;
        });
    }
  }, [sessions.size, rootPath]);

  // const handleCopyToChat = () => {
  //   if (!activeSessionId) {
  //     return;
  //   }

  //   const recentOutput = terminalService.getRecentCommands(activeSessionId, 50);

  //   if (!recentOutput.trim()) {
  //     toast.error('No terminal output to copy');
  //     return;
  //   }

  //   // Format as markdown code block
  //   const formattedContent = `\`\`\`terminal\n${recentOutput}\n\`\`\``;

  //   if (onCopyToChat) {
  //     onCopyToChat(formattedContent);
  //     toast.success('Terminal output copied to chat');
  //   } else {
  //     // Fallback: copy to clipboard
  //     navigator.clipboard.writeText(formattedContent).then(() => {
  //       toast.success('Terminal output copied to clipboard');
  //     });
  //   }
  // };

  return (
    <div className="flex flex-col h-full bg-background pb-1">
      {/* Combined Toolbar and Tabs */}
      <div className="flex items-center justify-between h-9 px-2 border-b bg-muted/20">
        <TerminalTabs />
        <div className="flex items-center gap-1">
          {/* <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleCopySelection}
            title="Copy selection"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleCopyToChat}
            title="Copy to chat"
          >
            <MessageSquare className="h-3.5 w-3.5" />
          </Button> */}
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onClose}
              title="Close terminal panel"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Terminal content */}
      <div className="flex-1 overflow-hidden">
        {activeSessionId ? (
          <Terminal sessionId={activeSessionId} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            No terminal sessions
          </div>
        )}
      </div>
    </div>
  );
}
