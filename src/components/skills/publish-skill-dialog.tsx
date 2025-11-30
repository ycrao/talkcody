// Publish skill to marketplace dialog

import { Github, Plus, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
import { validate as isValidUuid, v4 as uuidv4 } from 'uuid';
import { Badge } from '@/components/ui/badge';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { logger } from '@/lib/logger';
import { apiClient } from '@/services/api-client';
import { r2StorageService } from '@/services/r2-storage-service';
import { secureStorage } from '@/services/secure-storage';
import { getFileBasedSkillService } from '@/services/skills/file-based-skill-service';
import { MarketplaceService } from '@/services/skills/marketplace-service';
import { useAuthStore } from '@/stores/auth-store';
import type { Skill } from '@/types/skill';

interface PublishSkillDialogProps {
  skill: Skill;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
  name: string;
  description: string;
  longDescription: string;
  categories: string[];
  tags: string[];
  iconUrl: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  icon?: string;
}

export function PublishSkillDialog({ skill, open, onClose, onSuccess }: PublishSkillDialogProps) {
  const { isAuthenticated, user, signInWithGitHub } = useAuthStore();
  const nameId = useId();
  const descriptionId = useId();
  const longDescriptionId = useId();
  const iconUrlId = useId();
  const [formData, setFormData] = useState<FormData>({
    name: skill.name,
    description: skill.description,
    longDescription: skill.longDescription || '',
    categories: [],
    tags: skill.metadata.tags || [],
    iconUrl: skill.icon || '',
  });
  const [newTag, setNewTag] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);

  // Fetch categories from API
  useEffect(() => {
    const fetchCategories = async () => {
      setIsLoadingCategories(true);
      try {
        const response = await apiClient.get('/api/skills-marketplace/categories');
        if (response.ok) {
          const data = await response.json();
          setCategories(data.categories || []);
        } else {
          toast.error('Failed to load categories');
        }
      } catch (error) {
        logger.error('Failed to fetch categories:', error);
        toast.error('Failed to load categories');
      } finally {
        setIsLoadingCategories(false);
      }
    };

    if (open) {
      fetchCategories();
    }
  }, [open]);

  const handleInputChange = (field: keyof FormData, value: string | string[]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddCategory = (categorySlug: string) => {
    if (!formData.categories.includes(categorySlug)) {
      handleInputChange('categories', [...formData.categories, categorySlug]);
    }
  };

  const handleRemoveCategory = (categorySlug: string) => {
    handleInputChange(
      'categories',
      formData.categories.filter((slug) => slug !== categorySlug)
    );
  };

  const handleAddTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      handleInputChange('tags', [...formData.tags, newTag.trim()]);
      setNewTag('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    handleInputChange(
      'tags',
      formData.tags.filter((t) => t !== tag)
    );
  };

  const handlePublish = async () => {
    // Validation
    if (!formData.name.trim()) {
      toast.error('Skill name is required');
      return;
    }

    if (!formData.description.trim()) {
      toast.error('Description is required');
      return;
    }

    if (formData.categories.length === 0) {
      toast.error('Please select at least one category');
      return;
    }

    if (!isAuthenticated || !user) {
      toast.error('Please sign in to publish skills');
      return;
    }

    setIsPublishing(true);

    try {
      // Step 1: Check if this is a local file-based skill
      if (skill.metadata.sourceType !== 'local') {
        throw new Error('Only local file-based skills can be published');
      }

      // Step 2: Get the FileBasedSkill from file system (needed for packaging)
      const fileSkillService = await getFileBasedSkillService();
      let fileBasedSkill = await fileSkillService.getSkillById(skill.id);

      if (!fileBasedSkill) {
        throw new Error('Could not find skill files on disk');
      }

      // Step 2.5: Validate and regenerate skillId if necessary
      if (!isValidUuid(fileBasedSkill.id)) {
        const oldId = fileBasedSkill.id;
        const newId = uuidv4();

        logger.warn(`Skill has invalid UUID format: ${oldId}. Regenerating to: ${newId}`);
        toast.info(`Regenerating skill ID to UUID format...`);

        // Update the skill with new UUID
        fileBasedSkill.id = newId;
        fileBasedSkill.metadata.skillId = newId;
        await fileSkillService.updateSkill(fileBasedSkill);

        // Reload the skill with new ID
        const updatedSkill = await fileSkillService.getSkillById(newId);
        if (!updatedSkill) {
          throw new Error('Failed to reload skill after UUID regeneration');
        }
        fileBasedSkill = updatedSkill;
      }

      // Step 3: Get auth token and set it for R2 upload
      const authToken = await secureStorage.getAuthToken();
      if (!authToken) {
        throw new Error('No authentication token found. Please sign in again.');
      }
      r2StorageService.setAuthToken(authToken);

      // Step 4: Create skill metadata in database FIRST to get the slug
      const createResponse = await apiClient.post(
        '/api/skills',
        {
          name: formData.name,
          description: formData.description,
          longDescription: formData.longDescription || formData.description,
          systemPromptFragment: skill.content.systemPromptFragment || undefined,
          workflowRules: skill.content.workflowRules || undefined,
          documentation: skill.content.documentation || [],
          iconUrl: formData.iconUrl || undefined,
          categories: formData.categories,
          tags: formData.tags,
          hasScripts: fileBasedSkill.hasScripts,
        },
        { requireAuth: true }
      );

      if (!createResponse.ok) {
        const error = await createResponse.json();
        throw new Error(error.error || 'Failed to save skill metadata');
      }

      const createData = await createResponse.json();
      const skillSlug = createData.skill.slug;

      if (!skillSlug) {
        throw new Error('Failed to get skill slug from API');
      }

      // Step 5: Package skill and upload to R2 using the slug
      const marketplaceService = new MarketplaceService();
      const publishResult = await marketplaceService.publishSkill({
        skill: fileBasedSkill,
        slug: skillSlug, // Use slug from database
        marketplaceMetadata: {
          author: {
            name: user.displayName || user.name || 'Anonymous',
          },
          license: 'MIT', // Default license
          tags: formData.tags,
          longDescription: formData.longDescription || formData.description,
        },
      });

      if (!publishResult.success) {
        throw new Error(publishResult.error || 'Failed to package and upload skill');
      }

      // Step 6: Update skill with R2 storage information
      const updateResponse = await apiClient.patch(
        `/api/skills/${createData.skill.id}`,
        {
          storageUrl: publishResult.storageUrl,
          packageSize: publishResult.metadata.packageSize,
          checksum: publishResult.metadata.checksum,
        },
        { requireAuth: true }
      );

      if (!updateResponse.ok) {
        throw new Error('Failed to update skill with storage information');
      }

      // Step 7: Set skill as published
      const publishResponse = await apiClient.post(
        `/api/skills/${createData.skill.id}/publish`,
        undefined,
        { requireAuth: true }
      );

      if (!publishResponse.ok) {
        throw new Error('Failed to mark skill as published');
      }

      toast.success('Skill published successfully!');
      onSuccess();
      onClose();
    } catch (error) {
      logger.error('Publish error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to publish skill');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Publish Skill to Marketplace</DialogTitle>
          <DialogDescription>Share your skill with the TalkCody community</DialogDescription>
        </DialogHeader>

        {/* Sign In Section - shown when not authenticated */}
        {!isAuthenticated && (
          <div className="space-y-4 py-4 border-b">
            <div className="bg-muted/50 p-4 rounded-lg space-y-3">
              <p className="text-sm text-muted-foreground">
                You need to sign in to publish skills to the marketplace
              </p>
              <Button onClick={signInWithGitHub} variant="default" className="w-full">
                <Github className="mr-2 h-4 w-4" />
                Sign in with GitHub
              </Button>
            </div>
          </div>
        )}

        {/* User Info - shown when authenticated */}
        {isAuthenticated && user && (
          <div className="py-2 border-b">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Publishing as</span>
              <span className="font-medium text-foreground">{user.displayName || user.name}</span>
            </div>
          </div>
        )}

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor={nameId}>Skill Name *</Label>
            <Input
              id={nameId}
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="My Awesome Skill"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor={descriptionId}>Short Description *</Label>
            <Textarea
              id={descriptionId}
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="A brief description of what your skill does"
              rows={2}
            />
          </div>

          {/* Long Description */}
          <div className="space-y-2">
            <Label htmlFor={longDescriptionId}>Detailed Description</Label>
            <Textarea
              id={longDescriptionId}
              value={formData.longDescription}
              onChange={(e) => handleInputChange('longDescription', e.target.value)}
              placeholder="Provide more details about your skill's capabilities, use cases, and features"
              rows={4}
            />
          </div>

          {/* Categories */}
          <div className="space-y-2">
            <Label>Categories *</Label>
            <Select onValueChange={handleAddCategory} disabled={isLoadingCategories}>
              <SelectTrigger>
                <SelectValue
                  placeholder={isLoadingCategories ? 'Loading categories...' : 'Select categories'}
                />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem
                    key={category.slug}
                    value={category.slug}
                    disabled={formData.categories.includes(category.slug)}
                  >
                    {category.icon && `${category.icon} `}
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {formData.categories.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.categories.map((categorySlug) => {
                  const category = categories.find((c) => c.slug === categorySlug);
                  return (
                    <Badge key={categorySlug} variant="secondary">
                      {category?.icon && `${category.icon} `}
                      {category?.name}
                      <button
                        type="button"
                        onClick={() => handleRemoveCategory(categorySlug)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="Add tags (press Enter)"
              />
              <Button type="button" size="icon" variant="outline" onClick={handleAddTag}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.tags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Icon URL */}
          <div className="space-y-2">
            <Label htmlFor={iconUrlId}>Icon URL (optional)</Label>
            <Input
              id={iconUrlId}
              value={formData.iconUrl}
              onChange={(e) => handleInputChange('iconUrl', e.target.value)}
              placeholder="https://example.com/icon.png"
            />
            <p className="text-xs text-muted-foreground">
              Provide a URL to an icon image for your skill (recommended: 256x256px)
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPublishing}>
            Cancel
          </Button>
          <Button onClick={handlePublish} disabled={isPublishing || !isAuthenticated}>
            {isPublishing ? 'Publishing...' : 'Publish to Marketplace'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
