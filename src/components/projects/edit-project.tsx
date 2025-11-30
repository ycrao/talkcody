// src/components/projects/edit-project.tsx

import { zodResolver } from '@hookform/resolvers/zod';
import { FolderGit2, Loader2, Save } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useProjects } from '@/hooks/use-projects';
import type { Project } from '@/services/database-service';

const editProjectSchema = z.object({
  name: z
    .string()
    .min(1, 'Project name is required')
    .max(100, 'Project name must be less than 100 characters'),
  description: z.string().max(5000, 'Description must be less than 5000 characters'),
  context: z.string().max(2000, 'Context must be less than 2000 characters'),
  rules: z.string().max(2000, 'Rules must be less than 2000 characters'),
});

type EditProjectFormValues = z.infer<typeof editProjectSchema>;

interface EditProjectProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectUpdated?: () => void;
}

const defaultFormValues: EditProjectFormValues = {
  name: '',
  description: '',
  context: '',
  rules: '',
};

export function EditProject({ project, open, onOpenChange, onProjectUpdated }: EditProjectProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { updateProject } = useProjects();

  const form = useForm<EditProjectFormValues>({
    resolver: zodResolver(editProjectSchema),
    defaultValues: defaultFormValues,
  });

  // Memoize the reset function to ensure stability
  const resetForm = useCallback(() => {
    if (project && open) {
      form.reset({
        name: project.name,
        description: project.description || '',
        context: project.context || '',
        rules: project.rules || '',
      });
    } else {
      form.reset(defaultFormValues);
    }
  }, [
    project?.id,
    project?.name,
    project?.description,
    project?.context,
    project?.rules,
    open,
    form,
    project,
  ]);

  // Use the memoized reset function
  useEffect(() => {
    resetForm();
  }, [resetForm]);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        // Reset form when closing
        form.reset(defaultFormValues);
      }
      onOpenChange(newOpen);
    },
    [form, onOpenChange]
  );

  const onSubmit = async (data: EditProjectFormValues) => {
    if (!project) return;

    try {
      setIsSubmitting(true);
      await updateProject(project.id, data);

      toast.success(() => (
        <div>
          <p>Project updated</p>
          <p>Project "{data.name}" has been updated successfully.</p>
        </div>
      ));

      handleOpenChange(false);
      onProjectUpdated?.();
    } catch (error) {
      toast.error(() => (
        <div>
          <p>Error</p>
          <p>{error instanceof Error ? error.message : 'Failed to update project'}</p>
        </div>
      ));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!project) return null;

  const isDefaultProject = project.id === 'default';

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
          <DialogDescription>
            Update project settings and configuration.
            {isDefaultProject && (
              <span className="mt-2 block text-amber-600">
                Note: This is the default project that cannot be deleted.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            {project.root_path && (
              <div className="rounded-lg bg-muted/50 p-3">
                <div className="flex items-center gap-2 text-sm">
                  <FolderGit2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Repository Path:</span>
                  <span className="truncate text-muted-foreground" title={project.root_path}>
                    {project.root_path}
                  </span>
                </div>
              </div>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter project name..." {...field} disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      className="resize-none"
                      placeholder="Brief description of this project..."
                      rows={2}
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormDescription>
                    Optional description to help identify this project
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="context"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Context</FormLabel>
                  <FormControl>
                    <Textarea
                      className="resize-none"
                      placeholder="Provide context that will be shared with AI assistants in this project..."
                      rows={3}
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormDescription>
                    Context information that will be provided to AI assistants in conversations
                    within this project
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="rules"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Rules</FormLabel>
                  <FormControl>
                    <Textarea
                      className="resize-none"
                      placeholder="Define specific rules or guidelines for AI assistants in this project..."
                      rows={3}
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormDescription>
                    Specific rules and guidelines that AI assistants should follow in this project
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                disabled={isSubmitting}
                onClick={() => handleOpenChange(false)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={isSubmitting} type="submit">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
