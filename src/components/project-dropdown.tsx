import { ChevronDown, FolderPlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { logger } from '@/lib/logger';
import { databaseService, type Project } from '@/services/database-service';

interface ProjectSelectorProps {
  currentProjectId: string | null;
  onProjectSelect: (projectId: string) => Promise<void>;
  onImportRepository: () => Promise<void>;
  isLoading: boolean;
}

export function ProjectDropdown({
  currentProjectId,
  onProjectSelect,
  onImportRepository,
  isLoading,
}: ProjectSelectorProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      setIsLoadingProjects(true);
      const allProjects = await databaseService.getProjects();
      setProjects(allProjects);

      if (currentProjectId) {
        const project = allProjects.find((p) => p.id === currentProjectId);
        setCurrentProject(project || null);
      } else {
        setCurrentProject(null);
      }
    } catch (error) {
      logger.error('Failed to load projects:', error);
      toast.error('Failed to load projects');
    } finally {
      setIsLoadingProjects(false);
    }
  }, [currentProjectId]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Additional effect to update currentProject when projects list changes
  // This handles the case where projects are reloaded after import
  useEffect(() => {
    if (currentProjectId && projects.length > 0) {
      const project = projects.find((p) => p.id === currentProjectId);
      if (project && project !== currentProject) {
        setCurrentProject(project);
      }
    }
  }, [projects, currentProjectId, currentProject]);

  const handleProjectSelect = async (projectId: string) => {
    try {
      await onProjectSelect(projectId);
    } catch (error) {
      logger.error('Failed to switch project:', error);
      toast.error('Failed to switch project');
    }
  };

  const handleImportRepository = async () => {
    try {
      await onImportRepository();
      // Reload projects after importing a new repository
      await loadProjects();
    } catch (error) {
      logger.error('Failed to import repository:', error);
      toast.error('Failed to import repository');
    }
  };

  if (isLoadingProjects) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-4 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-2 font-medium text-sm hover:bg-gray-200 dark:hover:bg-gray-800"
          disabled={isLoading}
        >
          {currentProject ? (
            <>
              <span className="max-w-[200px] truncate">{currentProject.name}</span>
              <ChevronDown className="h-4 w-4" />
            </>
          ) : (
            <span className="text-muted-foreground">Select Project</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-96 w-64 overflow-y-auto">
        {projects.length > 0 ? (
          projects.map((project) => (
            <DropdownMenuItem
              key={project.id}
              onClick={() => handleProjectSelect(project.id)}
              className="flex flex-col items-start gap-1"
            >
              <div className="w-full truncate font-medium">{project.name}</div>
              {project.root_path && (
                <div className="w-full truncate text-muted-foreground text-xs">
                  {project.root_path}
                </div>
              )}
              {project.id === 'default' && (
                <div className="text-muted-foreground text-xs">Default Project</div>
              )}
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem disabled>No projects available</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleImportRepository} className="flex items-center gap-2">
          <FolderPlus className="h-4 w-4" />
          Import Repository
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
