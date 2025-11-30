import {
  Bot,
  Files,
  FolderOpen,
  MessageSquare,
  Moon,
  Server,
  Settings,
  Sun,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/utils';
import { NavigationView } from '@/types/navigation';

interface NavigationSidebarProps {
  activeView: NavigationView;
  onViewChange: (view: NavigationView) => void;
}

export function NavigationSidebar({ activeView, onViewChange }: NavigationSidebarProps) {
  const { resolvedTheme, toggleTheme } = useTheme();

  const navigationItems = [
    {
      id: NavigationView.EXPLORER,
      icon: Files,
      label: 'Explorer',
      tooltip: 'Browse and open files in your project (⇧⌘E)',
    },
    {
      id: NavigationView.CHAT,
      icon: MessageSquare,
      label: 'Chat',
      tooltip: 'AI chat conversations (⇧⌘C)',
    },
    {
      id: NavigationView.PROJECTS,
      icon: FolderOpen,
      label: 'Projects',
      tooltip: 'Manage your projects (⇧⌘P)',
    },
    {
      id: NavigationView.AGENTS,
      icon: Bot,
      label: 'Agents',
      tooltip: 'Browse marketplace and manage local agents (⇧⌘A)',
    },
    {
      id: NavigationView.SKILLS_MARKETPLACE,
      icon: Zap,
      label: 'Skills',
      tooltip: 'Discover and install skills (⇧⌘S)',
    },
    {
      id: NavigationView.MCP_SERVERS,
      icon: Server,
      label: 'MCP Servers',
      tooltip: 'Model Context Protocol servers (⇧⌘M)',
    },
  ];

  const handleSettingsClick = () => {
    onViewChange(NavigationView.SETTINGS);
  };

  const handleAgentsClick = () => {
    onViewChange(NavigationView.AGENTS);
  };

  return (
    <div className="flex h-full w-12 flex-col border-r bg-gray-50 dark:bg-gray-900">
      {/* Top Navigation Items */}
      <div className="flex flex-col items-center space-y-1 p-1">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;

          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-10 w-10 p-0',
                    'hover:bg-gray-200 dark:hover:bg-gray-800',
                    isActive && 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400'
                  )}
                  onClick={() => {
                    if (item.id === NavigationView.AGENTS) {
                      handleAgentsClick();
                    } else {
                      onViewChange(item.id);
                    }
                  }}
                >
                  <Icon className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{item.tooltip}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {/* Bottom Settings Items */}
      <div className="mt-auto flex flex-col items-center space-y-1 p-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 w-10 p-0 hover:bg-gray-200 dark:hover:bg-gray-800"
              onClick={toggleTheme}
            >
              {resolvedTheme === 'light' ? (
                <Moon className="h-3.5 w-3.5" />
              ) : (
                <Sun className="h-3.5 w-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            Switch to {resolvedTheme === 'light' ? 'dark' : 'light'} mode
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 w-10 p-0 hover:bg-gray-200 dark:hover:bg-gray-800"
              onClick={handleSettingsClick}
            >
              <Settings className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Application settings</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
