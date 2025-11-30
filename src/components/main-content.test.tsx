// src/components/main-content.test.tsx

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MainContent } from './main-content';
import { NavigationView } from '@/types/navigation';

// Mock all page components
vi.mock('@/pages/explorer-page', () => ({
  ExplorerPage: () => <div data-testid="explorer-page">Explorer Page</div>,
}));

vi.mock('@/pages/chat-page', () => ({
  ChatOnlyPage: () => <div data-testid="chat-page">Chat Page</div>,
}));

vi.mock('@/pages/projects-page', () => ({
  ProjectsPage: () => <div data-testid="projects-page">Projects Page</div>,
}));

vi.mock('@/pages/agent-marketplace-page', () => ({
  AgentMarketplacePage: () => <div data-testid="agent-marketplace-page">Agent Marketplace Page</div>,
}));

vi.mock('@/pages/skills-marketplace-page', () => ({
  SkillsMarketplacePage: () => <div data-testid="skills-marketplace-page">Skills Marketplace Page</div>,
}));

vi.mock('@/pages/mcp-servers-page', () => ({
  MCPServersPage: () => <div data-testid="mcp-servers-page">MCP Servers Page</div>,
}));

vi.mock('@/pages/settings-page', () => ({
  SettingsPage: () => <div data-testid="settings-page">Settings Page</div>,
}));

describe('MainContent - State Persistence on Page Switch', () => {
  it('should render all pages in the DOM but only show the active one', () => {
    const { container } = render(<MainContent activeView={NavigationView.CHAT} />);

    // All pages should be in the DOM
    expect(screen.getByTestId('explorer-page')).toBeInTheDocument();
    expect(screen.getByTestId('chat-page')).toBeInTheDocument();
    expect(screen.getByTestId('projects-page')).toBeInTheDocument();
    // Note: agent-marketplace-page appears twice (for AGENTS and MARKETPLACE views)
    expect(screen.getAllByTestId('agent-marketplace-page')).toHaveLength(2);
    expect(screen.getByTestId('skills-marketplace-page')).toBeInTheDocument();
    expect(screen.getByTestId('mcp-servers-page')).toBeInTheDocument();
    expect(screen.getByTestId('settings-page')).toBeInTheDocument();

    // Only chat page should be visible (not hidden)
    const chatPageContainer = screen.getByTestId('chat-page').parentElement;
    const explorerPageContainer = screen.getByTestId('explorer-page').parentElement;

    expect(chatPageContainer).not.toHaveClass('hidden');
    expect(explorerPageContainer).toHaveClass('hidden');
  });

  it('should keep all pages mounted when switching between views', () => {
    const { rerender } = render(<MainContent activeView={NavigationView.CHAT} />);

    // Initially on chat page
    const chatPage = screen.getByTestId('chat-page');
    const explorerPage = screen.getByTestId('explorer-page');

    expect(chatPage).toBeInTheDocument();
    expect(explorerPage).toBeInTheDocument();

    // Switch to explorer
    rerender(<MainContent activeView={NavigationView.EXPLORER} />);

    // Both pages should still be in the DOM (not unmounted)
    expect(chatPage).toBeInTheDocument();
    expect(explorerPage).toBeInTheDocument();

    // Visibility should have switched
    const chatPageContainer = chatPage.parentElement;
    const explorerPageContainer = explorerPage.parentElement;

    expect(chatPageContainer).toHaveClass('hidden');
    expect(explorerPageContainer).not.toHaveClass('hidden');
  });

  it('should preserve component state across page switches', () => {
    // This test verifies that components are not unmounted (which would reset state)
    // by checking that the same DOM nodes persist across re-renders

    const { rerender } = render(<MainContent activeView={NavigationView.CHAT} />);

    const chatPageBefore = screen.getByTestId('chat-page');
    const explorerPageBefore = screen.getByTestId('explorer-page');

    // Switch to explorer
    rerender(<MainContent activeView={NavigationView.EXPLORER} />);

    // Switch back to chat
    rerender(<MainContent activeView={NavigationView.CHAT} />);

    const chatPageAfter = screen.getByTestId('chat-page');
    const explorerPageAfter = screen.getByTestId('explorer-page');

    // The DOM nodes should be the same objects (not recreated)
    // This proves the components were not unmounted and remounted
    expect(chatPageBefore).toBe(chatPageAfter);
    expect(explorerPageBefore).toBe(explorerPageAfter);
  });

  it('should correctly show each navigation view', () => {
    const { rerender, unmount } = render(<MainContent activeView={NavigationView.EXPLORER} />);

    const views = [
      { view: NavigationView.EXPLORER, testId: 'explorer-page' },
      { view: NavigationView.CHAT, testId: 'chat-page' },
      { view: NavigationView.PROJECTS, testId: 'projects-page' },
      { view: NavigationView.SKILLS_MARKETPLACE, testId: 'skills-marketplace-page' },
      { view: NavigationView.MCP_SERVERS, testId: 'mcp-servers-page' },
      { view: NavigationView.SETTINGS, testId: 'settings-page' },
    ];

    for (const { view, testId } of views) {
      rerender(<MainContent activeView={view} />);

      const activePageContainer = screen.getByTestId(testId).parentElement;
      expect(activePageContainer).not.toHaveClass('hidden');
    }

    unmount();
  });
});
