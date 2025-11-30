// src/components/chat/file-preview.tsx
import { FileText, Image, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';
import type { MessageAttachment } from '@/types/agent';

interface FilePreviewProps {
  attachment: MessageAttachment;
  onRemove?: () => void;
  showRemove?: boolean;
}

export function FilePreview({ attachment, onRemove, showRemove = true }: FilePreviewProps) {
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return Image;
    if (mimeType.includes('pdf')) return FileText;
    if (mimeType.includes('text')) return FileText;
    if (mimeType.includes('document') || mimeType.includes('word')) return FileText;
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return FileText;
    return FileText; // Default icon
  };

  if (attachment.type === 'image' && attachment.content) {
    // Image preview
    const imageSrc = `data:${attachment.mimeType};base64,${attachment.content}`;

    return (
      <div className="relative inline-block">
        <div className="relative overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <img
            alt={attachment.filename}
            className="max-h-48 max-w-xs object-contain"
            src={imageSrc}
            onError={(e) => logger.error('Image failed to load:', attachment.filename, e)}
          />
          {showRemove && onRemove && (
            <Button
              className="absolute top-1 right-1 h-6 w-6"
              onClick={onRemove}
              size="icon"
              type="button"
              variant="destructive"
            >
              <X size={12} />
            </Button>
          )}
        </div>
        <div className="mt-1 max-w-xs truncate text-gray-500 dark:text-gray-400 text-xs">
          {attachment.filename} ({formatFileSize(attachment.size)})
        </div>
      </div>
    );
  }

  // File preview
  const FileIcon = getFileIcon(attachment.mimeType);

  return (
    <div className="relative inline-block">
      <div className="relative flex min-w-[200px] max-w-xs items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3">
        <div className="flex-shrink-0">
          <FileIcon className="text-gray-600 dark:text-gray-400" size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-gray-900 dark:text-white text-sm">
            {attachment.filename}
          </div>
          <div className="text-gray-500 dark:text-gray-400 text-xs">
            {formatFileSize(attachment.size)}
          </div>
        </div>
        {showRemove && onRemove && (
          <Button
            className="absolute right-1 bottom-1 h-6 w-6 hover:bg-red-100 dark:hover:bg-red-900/20"
            onClick={onRemove}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="text-red-600 dark:text-red-400" size={12} />
          </Button>
        )}
      </div>
    </div>
  );
}
