import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useUpdater } from '@/hooks/use-updater';
import { UpdateDialog } from './update-dialog';

interface UpdateNotificationProps {
  checkOnMount?: boolean;
  periodicCheck?: boolean;
}

export function UpdateNotification({
  checkOnMount = true,
  periodicCheck = true,
}: UpdateNotificationProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const updater = useUpdater({ checkOnMount, periodicCheck });

  // Show notification when update is available
  useEffect(() => {
    if (updater.available && !dialogOpen) {
      toast.info('Update Available', {
        description: `Version ${updater.update?.version} is ready to install.`,
        action: {
          label: 'Update',
          onClick: () => setDialogOpen(true),
        },
        duration: 10000,
      });
    }
  }, [updater.available, updater.update?.version, dialogOpen]);

  // Show error notification
  useEffect(() => {
    if (updater.error && !dialogOpen) {
      toast.error('Update Error', {
        description: updater.error,
        action: {
          label: 'Dismiss',
          onClick: () => updater.dismissError(),
        },
      });
    }
  }, [updater.error, dialogOpen, updater.dismissError]);

  // Show success notification when downloaded
  useEffect(() => {
    if (updater.downloaded && !dialogOpen) {
      toast.success('Update Ready', {
        description: 'The update has been installed. Restart to apply changes.',
        action: {
          label: 'Restart',
          onClick: () => updater.restartApp(),
        },
        duration: Infinity,
      });
    }
  }, [updater.downloaded, dialogOpen, updater.restartApp]);

  return <UpdateDialog open={dialogOpen} onOpenChange={setDialogOpen} updater={updater} />;
}
