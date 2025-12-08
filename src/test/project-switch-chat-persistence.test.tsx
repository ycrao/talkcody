/**
 * Tests for project switch - chat messages persistence fix
 *
 * Bug: When switching projects, the chatbox would become empty/not display,
 * but if the user sent a message, it would append to the current conversation.
 *
 * Root cause: There were TWO different ChatBox instances in repository-layout.tsx:
 * - One in the "empty repository" early return (line 335)
 * - One in the main layout (line 646)
 * When switching projects, the component tree structure would change, causing
 * React to unmount one ChatBox and mount another, losing all messages in local state.
 *
 * Fix: Refactored to use a SINGLE ChatBox instance that always renders in the same
 * position in the component tree, regardless of whether a repository is loaded.
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useMessages } from '@/hooks/use-messages';
import { useMessagesStore } from '@/stores/messages-store';
import { useRepositoryStore } from '@/stores/repository-store';

// Test conversation ID for all tests
const TEST_CONVERSATION_ID = 'test-conversation-123';

describe('Project Switch - Chat Messages Persistence', () => {
  beforeEach(() => {
    // Reset repository store
    useRepositoryStore.setState({ rootPath: null, fileTree: null });
    // Reset messages store
    useMessagesStore.getState().messagesByConversation.clear();
  });

  describe('useMessages state persistence', () => {
    it('should NOT clear messages when repository state changes', () => {
      // useMessages now requires conversationId for per-conversation message caching
      const { result } = renderHook(() => useMessages(TEST_CONVERSATION_ID));

      // Add messages
      act(() => {
        result.current.addMessage('user', 'Hello', false);
        result.current.addMessage('assistant', 'Hi there!', false);
      });

      expect(result.current.messages).toHaveLength(2);

      // Simulate project switch by changing repository state
      act(() => {
        useRepositoryStore.setState({
          rootPath: '/new/path',
          fileTree: { name: 'root', path: '/new/path', isDirectory: true, children: [] },
        });
      });

      // Messages should still exist
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0].content).toBe('Hello');
      expect(result.current.messages[1].content).toBe('Hi there!');
    });

    it('should preserve messages when switching from no repository to having one', () => {
      const { result } = renderHook(() => useMessages(TEST_CONVERSATION_ID));

      // Add messages while no repository is open
      act(() => {
        result.current.addMessage('user', 'Test message', false);
      });

      // Switch to a repository
      act(() => {
        useRepositoryStore.setState({
          rootPath: '/some/path',
          fileTree: { name: 'root', path: '/some/path', isDirectory: true, children: [] },
        });
      });

      // Messages should persist
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].content).toBe('Test message');
    });

    it('should preserve messages when switching between repositories', () => {
      const { result } = renderHook(() => useMessages(TEST_CONVERSATION_ID));

      // Set initial repository
      act(() => {
        useRepositoryStore.setState({
          rootPath: '/path/a',
          fileTree: { name: 'a', path: '/path/a', isDirectory: true, children: [] },
        });
      });

      // Add messages
      act(() => {
        result.current.addMessage('user', 'Message for project A', false);
      });

      // Switch to different repository
      act(() => {
        useRepositoryStore.setState({
          rootPath: '/path/b',
          fileTree: { name: 'b', path: '/path/b', isDirectory: true, children: [] },
        });
      });

      // Messages should still exist
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].content).toBe('Message for project A');
    });

    it('should preserve messages when closing repository', () => {
      const { result } = renderHook(() => useMessages(TEST_CONVERSATION_ID));

      // Set initial repository
      act(() => {
        useRepositoryStore.setState({
          rootPath: '/some/path',
          fileTree: { name: 'root', path: '/some/path', isDirectory: true, children: [] },
        });
      });

      // Add messages
      act(() => {
        result.current.addMessage('user', 'Important message', false);
        result.current.addMessage('assistant', 'Response', false);
      });

      // Close repository (set to null)
      act(() => {
        useRepositoryStore.setState({
          rootPath: null,
          fileTree: null,
        });
      });

      // Messages should persist
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0].content).toBe('Important message');
      expect(result.current.messages[1].content).toBe('Response');
    });

    it('should preserve messages with attachments during project switch', () => {
      const { result } = renderHook(() => useMessages(TEST_CONVERSATION_ID));

      const attachments = [
        {
          id: 'test-attachment',
          type: 'file' as const,
          filename: 'test.txt',
          content: 'file content',
          filePath: '/path/to/test.txt',
          mimeType: 'text/plain',
          size: 512,
        },
      ];

      act(() => {
        result.current.addMessage('user', 'Message with attachment', false, undefined, attachments);
      });

      // Switch repository
      act(() => {
        useRepositoryStore.setState({
          rootPath: '/new/project',
          fileTree: { name: 'root', path: '/new/project', isDirectory: true, children: [] },
        });
      });

      // Message and attachments should persist
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].content).toBe('Message with attachment');
      expect(result.current.messages[0].attachments).toEqual(attachments);
    });
  });

  describe('hasRepository flag behavior', () => {
    it('hasRepository should be false when rootPath is null', () => {
      const rootPath = useRepositoryStore.getState().rootPath;
      const fileTree = useRepositoryStore.getState().fileTree;
      const hasRepository = !!(rootPath && fileTree);

      expect(hasRepository).toBe(false);
    });

    it('hasRepository should be true when both rootPath and fileTree are set', () => {
      act(() => {
        useRepositoryStore.setState({
          rootPath: '/some/path',
          fileTree: { name: 'root', path: '/some/path', isDirectory: true, children: [] },
        });
      });

      const rootPath = useRepositoryStore.getState().rootPath;
      const fileTree = useRepositoryStore.getState().fileTree;
      const hasRepository = !!(rootPath && fileTree);

      expect(hasRepository).toBe(true);
    });

    it('hasRepository transitions correctly during project switch', () => {
      // Initially no repository
      let hasRepository = !!(
        useRepositoryStore.getState().rootPath && useRepositoryStore.getState().fileTree
      );
      expect(hasRepository).toBe(false);

      // Open first project
      act(() => {
        useRepositoryStore.setState({
          rootPath: '/project/a',
          fileTree: { name: 'a', path: '/project/a', isDirectory: true, children: [] },
        });
      });
      hasRepository = !!(
        useRepositoryStore.getState().rootPath && useRepositoryStore.getState().fileTree
      );
      expect(hasRepository).toBe(true);

      // Switch to second project
      act(() => {
        useRepositoryStore.setState({
          rootPath: '/project/b',
          fileTree: { name: 'b', path: '/project/b', isDirectory: true, children: [] },
        });
      });
      hasRepository = !!(
        useRepositoryStore.getState().rootPath && useRepositoryStore.getState().fileTree
      );
      expect(hasRepository).toBe(true);

      // Close repository
      act(() => {
        useRepositoryStore.setState({
          rootPath: null,
          fileTree: null,
        });
      });
      hasRepository = !!(
        useRepositoryStore.getState().rootPath && useRepositoryStore.getState().fileTree
      );
      expect(hasRepository).toBe(false);
    });
  });
});
