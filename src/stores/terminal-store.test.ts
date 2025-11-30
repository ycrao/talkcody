import { describe, it, expect, beforeEach } from 'vitest';
import { useTerminalStore } from './terminal-store';
import type { TerminalSession } from './terminal-store';

describe('Terminal Store - Tab Switching', () => {
  beforeEach(() => {
    // Reset the store before each test by removing all sessions
    const store = useTerminalStore.getState();
    const allSessions = store.getAllSessions();
    for (const session of allSessions) {
      store.removeSession(session.id);
    }
  });

  const createMockSession = (id: string, title: string): TerminalSession => ({
    id,
    ptyId: `pty-${id}`,
    title,
    buffer: '',
    isActive: false,
    createdAt: new Date(),
  });

  describe('selectNextSession', () => {
    it('should do nothing when there are no sessions', () => {
      const store = useTerminalStore.getState();
      const initialActiveId = store.activeSessionId;

      store.selectNextSession();

      expect(store.activeSessionId).toBe(initialActiveId);
    });

    it('should do nothing when there is only one session', () => {
      const store = useTerminalStore.getState();
      const session = createMockSession('session-1', 'Terminal 1');

      store.addSession(session);
      const initialActiveId = store.activeSessionId;

      store.selectNextSession();

      expect(store.activeSessionId).toBe(initialActiveId);
    });

    it('should switch to next session when multiple sessions exist', () => {
      const store = useTerminalStore.getState();
      const session1 = createMockSession('session-1', 'Terminal 1');
      const session2 = createMockSession('session-2', 'Terminal 2');
      const session3 = createMockSession('session-3', 'Terminal 3');

      store.addSession(session1);
      store.addSession(session2);
      store.addSession(session3);

      // Set active to first session
      store.setActiveSession('session-1');
      expect(useTerminalStore.getState().activeSessionId).toBe('session-1');

      // Switch to next
      store.selectNextSession();
      expect(useTerminalStore.getState().activeSessionId).toBe('session-2');

      // Switch to next again
      store.selectNextSession();
      expect(useTerminalStore.getState().activeSessionId).toBe('session-3');
    });

    it('should wrap around to first session when at the last session', () => {
      const store = useTerminalStore.getState();
      const session1 = createMockSession('session-1', 'Terminal 1');
      const session2 = createMockSession('session-2', 'Terminal 2');
      const session3 = createMockSession('session-3', 'Terminal 3');

      store.addSession(session1);
      store.addSession(session2);
      store.addSession(session3);

      // Set active to last session
      store.setActiveSession('session-3');
      expect(useTerminalStore.getState().activeSessionId).toBe('session-3');

      // Switch to next should wrap to first
      store.selectNextSession();
      expect(useTerminalStore.getState().activeSessionId).toBe('session-1');
    });

    it('should handle case when no session is currently active', () => {
      const store = useTerminalStore.getState();
      const session1 = createMockSession('session-1', 'Terminal 1');
      const session2 = createMockSession('session-2', 'Terminal 2');

      store.addSession(session1);
      store.addSession(session2);

      // Set active to null
      store.setActiveSession(null);
      expect(useTerminalStore.getState().activeSessionId).toBeNull();

      // Select next should select first session
      store.selectNextSession();
      expect(useTerminalStore.getState().activeSessionId).toBe('session-1');
    });
  });

  describe('selectPreviousSession', () => {
    it('should do nothing when there are no sessions', () => {
      const store = useTerminalStore.getState();
      const initialActiveId = store.activeSessionId;

      store.selectPreviousSession();

      expect(store.activeSessionId).toBe(initialActiveId);
    });

    it('should do nothing when there is only one session', () => {
      const store = useTerminalStore.getState();
      const session = createMockSession('session-1', 'Terminal 1');

      store.addSession(session);
      const initialActiveId = store.activeSessionId;

      store.selectPreviousSession();

      expect(store.activeSessionId).toBe(initialActiveId);
    });

    it('should switch to previous session when multiple sessions exist', () => {
      const store = useTerminalStore.getState();
      const session1 = createMockSession('session-1', 'Terminal 1');
      const session2 = createMockSession('session-2', 'Terminal 2');
      const session3 = createMockSession('session-3', 'Terminal 3');

      store.addSession(session1);
      store.addSession(session2);
      store.addSession(session3);

      // Set active to last session
      store.setActiveSession('session-3');
      expect(useTerminalStore.getState().activeSessionId).toBe('session-3');

      // Switch to previous
      store.selectPreviousSession();
      expect(useTerminalStore.getState().activeSessionId).toBe('session-2');

      // Switch to previous again
      store.selectPreviousSession();
      expect(useTerminalStore.getState().activeSessionId).toBe('session-1');
    });

    it('should wrap around to last session when at the first session', () => {
      const store = useTerminalStore.getState();
      const session1 = createMockSession('session-1', 'Terminal 1');
      const session2 = createMockSession('session-2', 'Terminal 2');
      const session3 = createMockSession('session-3', 'Terminal 3');

      store.addSession(session1);
      store.addSession(session2);
      store.addSession(session3);

      // Set active to first session
      store.setActiveSession('session-1');
      expect(useTerminalStore.getState().activeSessionId).toBe('session-1');

      // Switch to previous should wrap to last
      store.selectPreviousSession();
      expect(useTerminalStore.getState().activeSessionId).toBe('session-3');
    });

    it('should handle case when no session is currently active', () => {
      const store = useTerminalStore.getState();
      const session1 = createMockSession('session-1', 'Terminal 1');
      const session2 = createMockSession('session-2', 'Terminal 2');

      store.addSession(session1);
      store.addSession(session2);

      // Set active to null
      store.setActiveSession(null);
      expect(useTerminalStore.getState().activeSessionId).toBeNull();

      // Select previous should select last session
      store.selectPreviousSession();
      expect(useTerminalStore.getState().activeSessionId).toBe('session-2');
    });
  });

  describe('Tab switching integration', () => {
    it('should cycle through all sessions correctly with next', () => {
      const store = useTerminalStore.getState();
      const session1 = createMockSession('session-1', 'Terminal 1');
      const session2 = createMockSession('session-2', 'Terminal 2');
      const session3 = createMockSession('session-3', 'Terminal 3');

      store.addSession(session1);
      store.addSession(session2);
      store.addSession(session3);

      store.setActiveSession('session-1');

      // Cycle through all sessions
      store.selectNextSession();
      expect(useTerminalStore.getState().activeSessionId).toBe('session-2');

      store.selectNextSession();
      expect(useTerminalStore.getState().activeSessionId).toBe('session-3');

      store.selectNextSession();
      expect(useTerminalStore.getState().activeSessionId).toBe('session-1');
    });

    it('should cycle through all sessions correctly with previous', () => {
      const store = useTerminalStore.getState();
      const session1 = createMockSession('session-1', 'Terminal 1');
      const session2 = createMockSession('session-2', 'Terminal 2');
      const session3 = createMockSession('session-3', 'Terminal 3');

      store.addSession(session1);
      store.addSession(session2);
      store.addSession(session3);

      store.setActiveSession('session-1');

      // Cycle through all sessions backwards
      store.selectPreviousSession();
      expect(useTerminalStore.getState().activeSessionId).toBe('session-3');

      store.selectPreviousSession();
      expect(useTerminalStore.getState().activeSessionId).toBe('session-2');

      store.selectPreviousSession();
      expect(useTerminalStore.getState().activeSessionId).toBe('session-1');
    });

    it('should alternate between next and previous correctly', () => {
      const store = useTerminalStore.getState();
      const session1 = createMockSession('session-1', 'Terminal 1');
      const session2 = createMockSession('session-2', 'Terminal 2');

      store.addSession(session1);
      store.addSession(session2);

      store.setActiveSession('session-1');

      // Next
      store.selectNextSession();
      expect(useTerminalStore.getState().activeSessionId).toBe('session-2');

      // Previous
      store.selectPreviousSession();
      expect(useTerminalStore.getState().activeSessionId).toBe('session-1');

      // Previous again
      store.selectPreviousSession();
      expect(useTerminalStore.getState().activeSessionId).toBe('session-2');

      // Next again
      store.selectNextSession();
      expect(useTerminalStore.getState().activeSessionId).toBe('session-1');
    });
  });
});
