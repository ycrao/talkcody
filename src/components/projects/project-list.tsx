// src/components/projects/project-list.tsx

import { formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle,
  Calendar,
  Edit,
  FolderGit2,
  FolderOpen,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useUiNavigation } from '@/contexts/ui-navigation';
import { useProjects } from '@/hooks/use-projects';
import { logger } from '@/lib/logger';
import type { Project } from '@/services/database-service';
import { useRepositoryStore } from '@/stores/repository-store';
import { settingsManager } from '@/stores/settings-store';
import { NavigationView } from '@/types/navigation';
import { CreateProject } from './create-project';
import { EditProject } from './edit-project';

interface ProjectStatsProps {
  projectId: string;
}

function ProjectStats({ projectId }: ProjectStatsProps) {
  const [stats, setStats] = useState<{ conversationCount: number } | null>(null);
  const { getProjectStats } = useProjects();

  useEffect(() => {
    const loadStats = async () => {
      try {
        const projectStats = await getProjectStats(projectId);
        setStats(projectStats);
      } catch (error) {
        logger.error('Failed to load project stats:', error);
      }
    };

    loadStats();
  }, [projectId, getProjectStats]);

  if (!stats) {
    return (
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-16" />
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Badge className="text-xs" variant="secondary">
        <MessageSquare className="mr-1 h-3 w-3" />
        {stats.conversationCount} conversations
      </Badge>
    </div>
  );
}

interface ProjectCardProps {
  project: Project;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
  onProjectClick: (project: Project) => void;
}

function ProjectCard({ project, onEdit, onDelete, onProjectClick }: ProjectCardProps) {
  const isDefaultProject = project.id === 'default';

  return (
    <Card
      className="group cursor-pointer transition-shadow hover:shadow-md"
      onClick={() => onProjectClick(project)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="truncate text-base">{project.name}</CardTitle>
              {isDefaultProject && (
                <Badge className="text-xs" variant="outline">
                  Default
                </Badge>
              )}
            </div>
            {project.description && (
              <CardDescription className="mt-1 line-clamp-2">{project.description}</CardDescription>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="h-8 w-8 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                variant="ghost"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(project)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              {!isDefaultProject && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-600 focus:text-red-600"
                    onClick={() => onDelete(project)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="space-y-3">
          <ProjectStats projectId={project.id} />

          {project.root_path && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <FolderGit2 className="h-3 w-3 flex-shrink-0" />
              <span className="truncate" title={project.root_path}>
                {project.root_path.split('/').pop() || project.root_path}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Calendar className="h-3 w-3" />
            Updated{' '}
            {formatDistanceToNow(new Date(project.updated_at), {
              addSuffix: true,
            })}
          </div>

          {(project.context || project.rules) && (
            <div className="flex gap-1">
              {project.context && (
                <Badge className="text-xs" variant="outline">
                  Has Context
                </Badge>
              )}
              {project.rules && (
                <Badge className="text-xs" variant="outline">
                  Has Rules
                </Badge>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ProjectList() {
  const { projects, isLoading, error, deleteProject, refreshProjects } = useProjects();
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { setActiveView } = useUiNavigation();
  const openRepository = useRepositoryStore((state) => state.openRepository);

  const handleProjectClick = async (project: Project) => {
    try {
      if (project.root_path) {
        // Project has root_path: open repository and navigate to EXPLORER
        await openRepository(project.root_path, project.id);
        setActiveView(NavigationView.EXPLORER);
      } else {
        // Project has no root_path: set as current project and navigate to CHAT
        await settingsManager.setCurrentProjectId(project.id);
        setActiveView(NavigationView.CHAT);
      }
    } catch (error) {
      logger.error('Failed to open project:', error);
      toast.error('Failed to open project');
    }
  };

  const handleDelete = async () => {
    if (!deletingProject) return;

    try {
      setIsDeleting(true);
      await deleteProject(deletingProject.id);

      toast.success(() => (
        <div>
          <p>Project deleted</p>
          <p>
            Project "{deletingProject.name}" has been deleted. All conversations have been moved to
            the default project.
          </p>
        </div>
      ));

      setDeletingProject(null);
    } catch (error) {
      toast.error(() => (
        <div>
          <p>Error</p>
          <p>{error instanceof Error ? error.message : 'Failed to delete project'}</p>
        </div>
      ));
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="mb-2 h-6 w-24" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map(() => (
            <Card key={crypto.randomUUID()}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-full" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                  <Skeleton className="h-4 w-28" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            <span>Failed to load projects: {error}</span>
          </div>
          <Button className="mt-3" onClick={() => refreshProjects()} variant="outline">
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const handleEditClose = () => {
    logger.info('handleEditClose called');
    setEditingProject(null);
    logger.info('editingProject set to null');
  };

  return (
    <div className="space-y-6 px-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-2xl tracking-tight">Projects</h2>
          <p className="text-muted-foreground">
            Organize your conversations into projects with custom context and rules.
          </p>
        </div>
        <CreateProject onProjectCreated={refreshProjects} />
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <FolderOpen className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 font-medium text-lg">No projects found</h3>
              <p className="mb-4 text-muted-foreground">
                Create your first project to get started organizing your conversations.
              </p>
              <CreateProject onProjectCreated={refreshProjects}>
                <Button>Create First Project</Button>
              </CreateProject>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              onDelete={setDeletingProject}
              onEdit={setEditingProject}
              onProjectClick={handleProjectClick}
              project={project}
            />
          ))}
        </div>
      )}

      <EditProject
        onOpenChange={(open) => {
          logger.info('ProjectList onOpenChange:', open);
          if (!open) {
            handleEditClose();
          }
        }}
        onProjectUpdated={refreshProjects}
        open={!!editingProject}
        project={editingProject}
      />

      <AlertDialog
        onOpenChange={(open) => !open && setDeletingProject(null)}
        open={!!deletingProject}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingProject?.name}"? All conversations in this
              project will be moved to the default project. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={isDeleting}
              onClick={handleDelete}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Project'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
