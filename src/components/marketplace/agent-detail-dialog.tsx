// Agent detail dialog

import type { Category, MarketplaceAgent, Tag } from '@talkcody/shared';
import { Calendar, Download, ExternalLink, Package, Star } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMarketplace } from '@/hooks/use-marketplace';
import { logger } from '@/lib/logger';
import { MODEL_TYPE_LABELS } from '@/types/model-types';

interface AgentDetailDialogProps {
  agent: MarketplaceAgent;
  open: boolean;
  onClose: () => void;
}

export function AgentDetailDialog({ agent, open, onClose }: AgentDetailDialogProps) {
  const [isInstalling, setIsInstalling] = useState(false);
  const { installAgent } = useMarketplace();

  // Debug: Log agent data when dialog opens
  if (open) {
    logger.debug('Agent Detail Dialog - Agent Data:', {
      name: agent.name,
      slug: agent.slug,
      author: agent.author,
      authorAgentCount: agent.author?.agentCount,
    });
  }

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      await installAgent(agent.slug, agent.latestVersion);
      toast.success(`${agent.name} installed successfully!`);
      onClose();
    } catch (error) {
      toast.error('Failed to install agent');
      logger.error('Install error:', error);
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-fit min-w-4/5 max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-4">
            {agent.iconUrl ? (
              <img
                src={agent.iconUrl}
                alt={agent.name}
                className="w-16 h-16 rounded-md object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-md bg-primary/10 flex items-center justify-center">
                <Package className="h-8 w-8 text-primary" />
              </div>
            )}

            <div className="flex-1">
              <DialogTitle className="text-2xl">{agent.name}</DialogTitle>
              <DialogDescription className="mt-1">{agent.description}</DialogDescription>

              <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Download className="h-4 w-4" />
                  {agent.installCount.toLocaleString()} installs
                </div>

                {agent.rating > 0 && (
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-current" />
                    {agent.rating} ({agent.ratingCount} ratings)
                  </div>
                )}

                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />v{agent.latestVersion}
                </div>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-4">
          <Tabs defaultValue="overview">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="configuration">Configuration</TabsTrigger>
              <TabsTrigger value="author">Author</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4 space-y-4">
              {/* Categories */}
              {agent.categories && agent.categories.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Categories</h3>
                  <div className="flex flex-wrap gap-2">
                    {agent.categories.map((category: Category) => (
                      <Badge key={category.id} variant="secondary">
                        {category.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Tags */}
              {agent.tags && agent.tags.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Tags</h3>
                  <div className="flex flex-wrap gap-2">
                    {agent.tags.map((tag: Tag) => (
                      <Badge key={tag.id} variant="outline">
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Model */}
              <div>
                <h3 className="text-sm font-semibold mb-2">AI Model Type</h3>
                <p className="text-sm text-muted-foreground">
                  {(agent as any).modelType
                    ? MODEL_TYPE_LABELS[
                        (agent as any).modelType as keyof typeof MODEL_TYPE_LABELS
                      ] || (agent as any).modelType
                    : agent.model || 'Main Model'}
                </p>
              </div>

              {/* Statistics */}
              <div>
                <h3 className="text-sm font-semibold mb-2">Statistics</h3>
                <div className="text-sm">
                  <div>
                    <span className="text-muted-foreground">Installs:</span>{' '}
                    {agent.installCount.toLocaleString()}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="configuration" className="mt-4 space-y-4">
              {/* System Prompt */}
              <div>
                <h3 className="text-sm font-semibold mb-2">System Prompt</h3>
                <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto whitespace-pre-wrap">
                  {agent.systemPrompt}
                </pre>
              </div>

              {/* Rules */}
              {agent.rules && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Rules</h3>
                  <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto whitespace-pre-wrap">
                    {agent.rules}
                  </pre>
                </div>
              )}

              {/* Output Format */}
              {agent.outputFormat && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Output Format</h3>
                  <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto whitespace-pre-wrap">
                    {agent.outputFormat}
                  </pre>
                </div>
              )}
            </TabsContent>

            <TabsContent value="author" className="mt-4 space-y-4">
              <div className="flex items-start gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={agent.author.avatarUrl || ''} />
                  <AvatarFallback>{agent.author.name.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>

                <div className="flex-1">
                  <h3 className="font-semibold">{agent.author.name}</h3>
                  {agent.author.bio && (
                    <p className="text-sm text-muted-foreground mt-1">{agent.author.bio}</p>
                  )}

                  {agent.author.website && (
                    <a
                      href={agent.author.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline flex items-center gap-1 mt-2"
                    >
                      Visit website
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}

                  <div className="text-sm text-muted-foreground mt-2">
                    {agent.author.agentCount} published agents
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex gap-2 mt-4">
          <Button onClick={handleInstall} disabled={isInstalling} className="flex-1">
            {isInstalling ? 'Installing...' : 'Install Agent'}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
