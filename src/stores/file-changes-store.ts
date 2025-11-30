import { create } from 'zustand';

export interface FileChange {
  filePath: string;
  operation: 'write' | 'edit';
  timestamp: number;
  originalContent?: string; // For edit operations, to show diff
  newContent?: string; // For edit operations, to show diff
}

interface FileChangesStore {
  // Map: conversationId -> FileChange[]
  changesByConversation: Map<string, FileChange[]>;

  // Add a file change for a conversation
  addChange: (
    conversationId: string,
    filePath: string,
    operation: 'write' | 'edit',
    originalContent?: string,
    newContent?: string
  ) => void;

  // Get all changes for a specific conversation
  getChanges: (conversationId: string) => FileChange[];

  // Clear changes for a specific conversation
  clearConversation: (conversationId: string) => void;

  // Clear all changes
  clearAll: () => void;
}

export const useFileChangesStore = create<FileChangesStore>((set, get) => ({
  changesByConversation: new Map(),

  addChange: (conversationId, filePath, operation, originalContent, newContent) => {
    set((state) => {
      const newMap = new Map(state.changesByConversation);
      const existing = newMap.get(conversationId) || [];

      // Check if this exact file path and operation already exists
      const existingIndex = existing.findIndex(
        (c) => c.filePath === filePath && c.operation === operation
      );

      const newChange: FileChange = {
        filePath,
        operation,
        timestamp: Date.now(),
        originalContent,
        newContent,
      };

      if (existingIndex >= 0) {
        // Update existing change with latest content
        existing[existingIndex] = newChange;
        newMap.set(conversationId, existing);
      } else {
        // Add new change
        newMap.set(conversationId, [...existing, newChange]);
      }

      return { changesByConversation: newMap };
    });
  },

  getChanges: (conversationId) => {
    return get().changesByConversation.get(conversationId) || [];
  },

  clearConversation: (conversationId) => {
    set((state) => {
      const newMap = new Map(state.changesByConversation);
      newMap.delete(conversationId);
      return { changesByConversation: newMap };
    });
  },

  clearAll: () => {
    set({ changesByConversation: new Map() });
  },
}));
