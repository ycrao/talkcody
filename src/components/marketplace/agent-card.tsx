// Marketplace agent card component

import type { MarketplaceAgent, Tag } from '@talkcody/shared';
import { Download, Star, User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface MarketplaceAgentCardProps {
  agent: MarketplaceAgent;
  onClick: () => void;
  onInstall?: (agent: MarketplaceAgent) => void;
  isInstalling?: boolean;
}

export function MarketplaceAgentCard({
  agent,
  onClick,
  onInstall,
  isInstalling = false,
}: MarketplaceAgentCardProps) {
  return (
    <Card className="cursor-pointer hover:bg-accent transition-colors" onClick={onClick}>
      <CardHeader>
        <div className="flex items-start gap-3">
          {agent.iconUrl ? (
            <img
              src={agent.iconUrl}
              alt={agent.name}
              className="w-12 h-12 rounded-md object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
              <User className="h-6 w-6 text-primary" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg truncate">{agent.name}</CardTitle>
              {agent.isFeatured && (
                <Badge variant="default" className="shrink-0">
                  <Star className="h-3 w-3 mr-1" />
                  Featured
                </Badge>
              )}
            </div>

            <CardDescription className="text-xs line-clamp-2 mt-1">
              {agent.description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Download className="h-3 w-3" />
            {agent.installCount.toLocaleString()}
          </div>

          {agent.rating > 0 && (
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-current" />
              {agent.rating} ({agent.ratingCount})
            </div>
          )}

          <div className="flex items-center gap-1">
            <Avatar className="h-4 w-4">
              <AvatarImage src={agent.author.avatarUrl || ''} />
              <AvatarFallback>
                {(agent.author.displayName || agent.author.name).charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="truncate">{agent.author.displayName || agent.author.name}</span>
          </div>
        </div>

        {agent.tags && agent.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {agent.tags.slice(0, 3).map((tag: Tag) => (
              <Badge key={tag.id} variant="outline" className="text-xs">
                {tag.name}
              </Badge>
            ))}
            {agent.tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{agent.tags.length - 3}
              </Badge>
            )}
          </div>
        )}
      </CardContent>

      <CardFooter className="gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          View Details
        </Button>
        <Button
          size="sm"
          className="flex-1"
          onClick={(e) => {
            e.stopPropagation();
            onInstall?.(agent);
          }}
          disabled={isInstalling || !onInstall}
        >
          {isInstalling ? 'Installing...' : 'Install'}
        </Button>
      </CardFooter>
    </Card>
  );
}
