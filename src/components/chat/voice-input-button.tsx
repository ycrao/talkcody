// src/components/chat/voice-input-button.tsx
import { Mic } from 'lucide-react';
import { PromptInputButton } from '../ai-elements/prompt-input';

interface VoiceInputButtonProps {
  onStartRecording: () => void;
  isRecording: boolean;
  isTranscribing: boolean;
  isSupported: boolean;
  error: string | null;
  disabled?: boolean;
}

export function VoiceInputButton({
  onStartRecording,
  isRecording,
  isTranscribing,
  isSupported,
  error,
  disabled = false,
}: VoiceInputButtonProps) {
  const getTooltip = () => {
    if (!isSupported) {
      return 'Voice recording not supported in this environment';
    }
    if (error) {
      return `Error: ${error}`;
    }
    if (isRecording || isTranscribing) {
      return 'Recording in progress...';
    }
    return 'Click to start voice recording';
  };

  return (
    <PromptInputButton
      onClick={onStartRecording}
      disabled={disabled || isTranscribing || isRecording || !isSupported}
      variant={isRecording ? 'default' : 'ghost'}
      title={getTooltip()}
      className={`${isRecording ? 'animate-pulse border-red-200 bg-red-50' : ''} ${
        isSupported ? '' : 'cursor-not-allowed opacity-50'
      }`}
    >
      <Mic size={16} className={isRecording ? 'text-red-500' : ''} />
    </PromptInputButton>
  );
}
