import type { User } from '@talkcody/shared';
import { Loader2, Upload } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getApiUrl } from '@/lib/config';
import { logger } from '@/lib/logger';
import { secureStorage } from '@/services/secure-storage';

interface ProfileEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
  onSave: (data: { displayName: string; avatarUrl: string }) => Promise<void>;
}

export function ProfileEditDialog({ open, onOpenChange, user, onSave }: ProfileEditDialogProps) {
  const avatarUrlId = useId();
  const avatarFileId = useId();
  const displayNameId = useId();

  const [displayName, setDisplayName] = useState(user.displayName || user.name);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleAvatarUrlChange = (url: string) => {
    setAvatarUrl(url);
    setAvatarFile(null);
    setAvatarPreview(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed');
      return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      toast.error('File too large. Maximum size is 5MB');
      return;
    }

    setAvatarFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    logger.info('=== handleSave called ===');
    logger.info('displayName:', displayName);
    logger.info('avatarUrl:', avatarUrl);

    try {
      setSaving(true);

      let finalAvatarUrl = avatarUrl;

      // Upload file if selected
      if (avatarFile) {
        logger.info('Uploading avatar file:', avatarFile.name);
        const formData = new FormData();
        formData.append('avatar', avatarFile);

        const apiUrl = getApiUrl('/api/users/me/avatar');
        logger.info('Uploading to:', apiUrl);

        // Get auth token
        const token = await secureStorage.getAuthToken();
        if (!token) {
          throw new Error('Authentication required. Please sign in again.');
        }

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json();
          logger.error('Avatar upload failed:', error);
          throw new Error(error.error || 'Failed to upload avatar');
        }

        const data = await response.json();
        finalAvatarUrl = data.avatarUrl;
        logger.info('Avatar uploaded successfully:', finalAvatarUrl);
      }

      // Save profile
      logger.info('Saving profile data...');
      await onSave({
        displayName: displayName.trim(),
        avatarUrl: finalAvatarUrl,
      });

      toast.success('Profile updated successfully');
      logger.info('Profile save completed successfully');
      onOpenChange(false);
    } catch (error) {
      logger.error('Save profile error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const currentAvatar = avatarPreview || avatarUrl || user.avatarUrl;
  const displayInitial = (displayName || user.name).charAt(0).toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
          <DialogDescription>Update your display name and profile picture</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Avatar Section */}
          <div className="flex flex-col items-center space-y-4">
            <Avatar className="h-24 w-24">
              <AvatarImage src={currentAvatar || ''} />
              <AvatarFallback className="text-2xl">{displayInitial}</AvatarFallback>
            </Avatar>

            <div className="w-full space-y-3">
              <div>
                <Label htmlFor={avatarUrlId}>Avatar URL</Label>
                <Input
                  id={avatarUrlId}
                  type="text"
                  placeholder="https://example.com/avatar.jpg"
                  value={avatarUrl}
                  onChange={(e) => handleAvatarUrlChange(e.target.value)}
                  className="mt-1.5"
                />
              </div>

              <div className="relative">
                <div className="flex items-center justify-center">
                  <span className="text-sm text-muted-foreground">or</span>
                </div>
              </div>

              <div>
                <Label htmlFor={avatarFileId}>Upload Image</Label>
                <div className="mt-1.5">
                  <label
                    htmlFor={avatarFileId}
                    className="flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
                  >
                    <Upload className="h-4 w-4" />
                    {avatarFile ? avatarFile.name : 'Choose file...'}
                  </label>
                  <input
                    id={avatarFileId}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  JPEG, PNG, GIF, or WebP (max 5MB)
                </p>
              </div>
            </div>
          </div>

          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor={displayNameId}>Display Name</Label>
            <Input
              id={displayNameId}
              type="text"
              placeholder="Enter your display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              This is how your name will appear in the marketplace
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !displayName.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
