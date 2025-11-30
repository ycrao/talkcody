import { useEffect, useState } from 'react';
import { ChatBox } from '@/components/chat-box';
import { ChatHistorySidebar } from '@/components/chat-history-sidebar';
import { ChatToolbar } from '@/components/chat-toolbar';
import { useConversations } from '@/hooks/use-conversations';
import { logger } from '@/lib/logger';
import { databaseService } from '@/services/database-service';
import { useRepositoryStore } from '@/stores/repository-store';
import { settingsManager } from '@/stores/settings-store';

export function ChatOnlyPage() {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  const { currentConversationId, selectConversation, startNewChat } = useConversations();

  const rootPath = useRepositoryStore((state) => state.rootPath);
  const openFiles = useRepositoryStore((state) => state.openFiles);
  const activeFileIndex = useRepositoryStore((state) => state.activeFileIndex);
  const selectFile = useRepositoryStore((state) => state.selectFile);
  const refreshFileTree = useRepositoryStore((state) => state.refreshFileTree);
  const refreshFile = useRepositoryStore((state) => state.refreshFile);
  const selectRepository = useRepositoryStore((state) => state.selectRepository);
  const openRepository = useRepositoryStore((state) => state.openRepository);
  const closeRepository = useRepositoryStore((state) => state.closeRepository);
  const isLoading = useRepositoryStore((state) => state.isLoading);

  // Derive currentFile from openFiles and activeFileIndex
  const currentFile =
    activeFileIndex >= 0 && activeFileIndex < openFiles.length ? openFiles[activeFileIndex] : null;

  // Load current project ID from settings
  useEffect(() => {
    const loadCurrentSettings = async () => {
      try {
        const projectId = await settingsManager.getProject();
        setCurrentProjectId(projectId);
      } catch (error) {
        logger.error('Failed to load current settings:', error);
      }
    };
    loadCurrentSettings();
  }, []);

  // Update currentProjectId when rootPath changes
  useEffect(() => {
    const loadProjectForRootPath = async () => {
      if (rootPath) {
        try {
          const projectId = await settingsManager.getProject();
          setCurrentProjectId(projectId);
        } catch (error) {
          logger.error('Failed to load project for root path:', error);
        }
      }
    };
    loadProjectForRootPath();
  }, [rootPath]);

  const handleNewChat = () => {
    startNewChat();
    setIsHistoryOpen(false);
  };

  const handleHistoryConversationSelect = (conversationId: string) => {
    selectConversation(conversationId);
    setIsHistoryOpen(false);
  };

  const handleConversationStart = (conversationId: string, _title: string) => {
    selectConversation(conversationId);
  };

  const handleDiffApplied = () => {
    refreshFileTree();
    if (currentFile) {
      refreshFile(currentFile.path);
    }
  };

  const handleProjectSelect = async (projectId: string) => {
    try {
      // Get the project from database
      const project = await databaseService.getProject(projectId);
      if (project) {
        // Update current project ID and save to settings
        setCurrentProjectId(projectId);
        await settingsManager.setProject(projectId);

        // If project has root_path, open the repository
        if (project.root_path) {
          await openRepository(project.root_path, projectId);
        } else {
          // If project has no root_path, close current repository to clear the UI
          closeRepository();
        }
      }
    } catch (error) {
      logger.error('Failed to switch project:', error);
      throw error;
    }
  };

  return (
    <div className="flex h-full">
      <ChatHistorySidebar
        currentConversationId={currentConversationId}
        onConversationSelect={handleHistoryConversationSelect}
        onNewChat={handleNewChat}
        currentProjectId={currentProjectId}
      />

      <div className="flex flex-1 flex-col bg-white dark:bg-gray-950">
        <ChatToolbar
          currentConversationId={currentConversationId}
          isHistoryOpen={isHistoryOpen}
          onConversationSelect={handleHistoryConversationSelect}
          onHistoryOpenChange={setIsHistoryOpen}
          onNewChat={handleNewChat}
          currentProjectId={currentProjectId}
          onProjectSelect={handleProjectSelect}
          onImportRepository={async () => {
            const newProject = await selectRepository();
            if (newProject) {
              setCurrentProjectId(newProject.id);
            }
          }}
          isLoadingProject={isLoading}
          rootPath={rootPath || undefined}
        />

        <div className="flex-1 overflow-hidden">
          <ChatBox
            conversationId={currentConversationId}
            fileContent={currentFile?.content || null}
            onConversationStart={handleConversationStart}
            onDiffApplied={handleDiffApplied}
            repositoryPath={rootPath || undefined}
            selectedFile={currentFile?.path || null}
            onFileSelect={selectFile}
          />
        </div>
      </div>
    </div>
  );
}
