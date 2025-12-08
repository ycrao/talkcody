import { AgentMarketplacePage } from '@/pages/agent-marketplace-page';
import { ChatOnlyPage } from '@/pages/chat-page';
import { ExplorerPage } from '@/pages/explorer-page';
import { LogsPage } from '@/pages/logs-page';
import { MCPServersPage } from '@/pages/mcp-servers-page';
import { ProjectsPage } from '@/pages/projects-page';
import { SettingsPage } from '@/pages/settings-page';
import { SkillsMarketplacePage } from '@/pages/skills-marketplace-page';
import { NavigationView } from '@/types/navigation';

interface MainContentProps {
  activeView: NavigationView;
}

export function MainContent({ activeView }: MainContentProps) {
  return (
    <div className="h-full w-full">
      {/* Keep ExplorerPage and ChatOnlyPage mounted to preserve state */}
      <div className={activeView === NavigationView.EXPLORER ? 'h-full' : 'hidden'}>
        <ExplorerPage />
      </div>

      <div className={activeView === NavigationView.CHAT ? 'h-full' : 'hidden'}>
        <ChatOnlyPage />
      </div>

      {/* Lazy load these pages to avoid unnecessary network requests on startup */}
      {activeView === NavigationView.PROJECTS && <ProjectsPage />}

      {activeView === NavigationView.AGENTS_MARKETPLACE && <AgentMarketplacePage />}

      {activeView === NavigationView.SKILLS_MARKETPLACE && <SkillsMarketplacePage />}

      {activeView === NavigationView.MCP_SERVERS && <MCPServersPage />}

      {activeView === NavigationView.LOGS && <LogsPage />}

      {activeView === NavigationView.SETTINGS && <SettingsPage />}
    </div>
  );
}
