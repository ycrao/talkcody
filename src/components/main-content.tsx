import { AgentMarketplacePage } from '@/pages/agent-marketplace-page';
import { ChatOnlyPage } from '@/pages/chat-page';
import { ExplorerPage } from '@/pages/explorer-page';
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
      {/* Keep all views mounted, use CSS to show/hide to preserve state */}
      <div className={activeView === NavigationView.EXPLORER ? 'h-full' : 'hidden'}>
        <ExplorerPage />
      </div>

      <div className={activeView === NavigationView.CHAT ? 'h-full' : 'hidden'}>
        <ChatOnlyPage />
      </div>

      <div className={activeView === NavigationView.PROJECTS ? 'h-full' : 'hidden'}>
        <ProjectsPage />
      </div>

      <div className={activeView === NavigationView.AGENTS ? 'h-full' : 'hidden'}>
        <AgentMarketplacePage />
      </div>

      <div className={activeView === NavigationView.MARKETPLACE ? 'h-full' : 'hidden'}>
        <AgentMarketplacePage />
      </div>

      <div className={activeView === NavigationView.SKILLS_MARKETPLACE ? 'h-full' : 'hidden'}>
        <SkillsMarketplacePage />
      </div>

      <div className={activeView === NavigationView.MCP_SERVERS ? 'h-full' : 'hidden'}>
        <MCPServersPage />
      </div>

      <div className={activeView === NavigationView.SETTINGS ? 'h-full' : 'hidden'}>
        <SettingsPage />
      </div>
    </div>
  );
}
