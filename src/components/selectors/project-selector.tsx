// src/components/chat/selectors/project-selector.tsx

import { useMemo } from 'react';
import { useProjects } from '@/hooks/use-projects';
import { useAppSettings } from '@/hooks/use-settings';
import { logger } from '@/lib/logger';
import { BaseSelector } from './base-selector';

interface ProjectSelectorProps {
  disabled?: boolean;
}

export function ProjectSelector({ disabled = false }: ProjectSelectorProps) {
  const { projects, isLoading: projectsLoading } = useProjects();
  const { settings, setProject, loading: settingsLoading } = useAppSettings();

  const projectItems = useMemo(
    () => [
      ...projects.map((project) => ({
        value: project.id,
        label: project.id,
        content: (
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-blue-500" />
            <span>{project.name}</span>
          </div>
        ),
      })),
    ],
    [projects]
  );

  const handleProjectChange = async (id: string) => {
    try {
      await setProject(id);
    } catch (error) {
      logger.error('Failed to update project:', error);
    }
  };

  if (settingsLoading || projectsLoading) {
    return null;
  }

  return (
    <BaseSelector
      disabled={disabled}
      items={projectItems}
      onValueChange={handleProjectChange}
      placeholder="Select project"
      value={settings.project}
    />
  );
}
