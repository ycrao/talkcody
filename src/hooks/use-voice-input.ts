// src/hooks/use-voice-input.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { aiTranscriptionService } from '@/services/ai-transcription-service';
import { ElevenLabsRealtimeService } from '@/services/elevenlabs-realtime-service';
import { useSettingsStore } from '@/stores/settings-store';

interface VoiceInputState {
  isRecording: boolean;
  isTranscribing: boolean;
  error: string | null;
  isSupported: boolean;
  isInitializing: boolean;
  recordingDuration: number;
  partialTranscript: string;
  isConnecting: boolean;
}

export function useVoiceInput() {
  const [state, setState] = useState<VoiceInputState>({
    isRecording: false,
    isTranscribing: false,
    error: null,
    isSupported: true,
    isInitializing: true,
    recordingDuration: 0,
    partialTranscript: '',
    isConnecting: false,
  });

  const { model_type_transcription, getProviderApiKey } = useSettingsStore();

  // MediaRecorder refs (for Whisper)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerIntervalRef = useRef<number | null>(null);

  // Real-time transcription refs (for Eleven Labs)
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioWorkletRef = useRef<AudioWorkletNode | null>(null);
  const realtimeServiceRef = useRef<ElevenLabsRealtimeService | null>(null);

  // Timer effect for recording duration
  useEffect(() => {
    if (state.isRecording) {
      // Start timer
      timerIntervalRef.current = window.setInterval(() => {
        setState((prev) => ({
          ...prev,
          recordingDuration: prev.recordingDuration + 1,
        }));
      }, 1000);
    } else {
      // Clear timer
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }

    // Cleanup on unmount
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [state.isRecording]);

  // Start real-time recording with Eleven Labs
  const startRealtimeRecording = useCallback(async () => {
    setState((prev) => ({ ...prev, isConnecting: true, error: null }));

    try {
      logger.info('[Realtime] Starting real-time transcription...');

      // 1. Get API key
      const apiKey = getProviderApiKey('elevenlabs');
      if (!apiKey) {
        throw new Error('Eleven Labs API key not configured. Please set it in Settings.');
      }

      // 2. Create and connect real-time service (using API key directly)
      const service = new ElevenLabsRealtimeService();

      service.onPartialTranscript((text) => {
        setState((prev) => ({ ...prev, partialTranscript: text }));
      });

      service.onFinalTranscript((text) => {
        logger.info('[Realtime] Final transcript received:', text);
        setState((prev) => ({
          ...prev,
          isRecording: false,
          isTranscribing: false,
          partialTranscript: '',
          recordingDuration: 0,
        }));
        toast.success('Transcription completed');
      });

      service.onError((error) => {
        logger.error('[Realtime] Transcription error:', error);
        setState((prev) => ({
          ...prev,
          isRecording: false,
          isTranscribing: false,
          isConnecting: false,
          error: error.message,
          partialTranscript: '',
        }));
        toast.error(`Transcription error: ${error.message}`);
      });

      service.onConnected(() => {
        logger.info('[Realtime] Service connected');
      });

      await service.connect(apiKey);
      realtimeServiceRef.current = service;

      // 4. Get microphone stream
      logger.info('[Realtime] Getting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      // 5. Create AudioContext and AudioWorklet
      logger.info('[Realtime] Creating AudioContext...');
      const context = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = context;

      // Load AudioWorklet module
      await context.audioWorklet.addModule('/audio-processor.worklet.js');

      const worklet = new AudioWorkletNode(context, 'audio-processor');
      audioWorkletRef.current = worklet;

      // 6. Connect audio stream
      const source = context.createMediaStreamSource(stream);
      source.connect(worklet);

      // 7. Listen for PCM data from worklet
      worklet.port.onmessage = (event: MessageEvent<{ pcmData: Int16Array }>) => {
        const { pcmData } = event.data;
        if (pcmData && pcmData.length > 0) {
          service.streamPCMAudio(pcmData);
        }
      };

      setState((prev) => ({
        ...prev,
        isRecording: true,
        isConnecting: false,
        recordingDuration: 0,
      }));

      toast.success('Real-time transcription started');
    } catch (error) {
      let errorMessage = 'Failed to start real-time transcription';

      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          errorMessage = 'Microphone access denied. Please allow microphone access and try again.';
        } else if (error.name === 'NotFoundError') {
          errorMessage = 'No microphone found. Please connect a microphone and try again.';
        } else if (error.name === 'NotReadableError') {
          errorMessage = 'Microphone is already in use by another application.';
        } else {
          errorMessage = error.message;
        }
      }

      setState((prev) => ({
        ...prev,
        error: errorMessage,
        isConnecting: false,
        isRecording: false,
      }));
      toast.error(errorMessage);
      logger.error('[Realtime] Start error:', error);
    }
  }, [getProviderApiKey]);

  // Stop real-time recording
  const stopRealtimeRecording = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        logger.info('[Realtime] Stopping real-time recording...');

        setState((prev) => ({ ...prev, isTranscribing: true }));

        // Set up one-time listener for final transcript
        const service = realtimeServiceRef.current;
        if (!service) {
          reject(new Error('Real-time service not available'));
          return;
        }

        // Store original callback and set up new one-time callback
        service.onFinalTranscript((text) => {
          logger.info('[Realtime] Final transcript:', text);

          // Cleanup
          audioWorkletRef.current?.disconnect();
          audioContextRef.current?.close();
          service.disconnect();

          if (streamRef.current) {
            for (const track of streamRef.current.getTracks()) {
              track.stop();
            }
            streamRef.current = null;
          }

          setState((prev) => ({
            ...prev,
            isRecording: false,
            isTranscribing: false,
            partialTranscript: '',
            recordingDuration: 0,
          }));

          toast.success('Transcription completed');
          resolve(text);
        });

        // Send commit signal
        service.commit();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to stop recording';
        setState((prev) => ({
          ...prev,
          isRecording: false,
          isTranscribing: false,
          error: errorMessage,
          partialTranscript: '',
        }));
        toast.error(`Stop recording failed: ${errorMessage}`);
        reject(error);
      }
    });
  }, []);

  const startRecording = useCallback(async () => {
    // Check if using real-time transcription
    // Support both 'scribe_v2_realtime' and 'scribe_v2_realtime@elevenlabs' formats
    if (model_type_transcription?.includes('scribe_v2_realtime')) {
      await startRealtimeRecording();
      return;
    }

    // Original MediaRecorder implementation for Whisper
    try {
      logger.info('Starting recording...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16_000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      audioChunksRef.current = [];

      // Get the best available format
      let mimeType = '';
      const supportedTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/mpeg',
        'audio/wav',
      ];

      for (const type of supportedTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }

      logger.info('Using MIME type:', mimeType);

      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          logger.info('Audio chunk received:', event.data.size, 'bytes');
        }
      };

      mediaRecorder.onerror = (event) => {
        logger.error('MediaRecorder error:', event);
        setState((prev) => ({ ...prev, error: 'Recording error occurred' }));
      };

      mediaRecorder.start(1000); // Collect data every second
      setState((prev) => ({ ...prev, isRecording: true, error: null, recordingDuration: 0 }));
      toast.success('Recording started');
    } catch (error) {
      let errorMessage = 'Failed to start recording';

      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          errorMessage = 'Microphone access denied. Please allow microphone access and try again.';
        } else if (error.name === 'NotFoundError') {
          errorMessage = 'No microphone found. Please connect a microphone and try again.';
        } else if (error.name === 'NotReadableError') {
          errorMessage = 'Microphone is already in use by another application.';
        } else {
          errorMessage = error.message;
        }
      }

      setState((prev) => ({ ...prev, error: errorMessage }));
      toast.error(errorMessage);
      logger.error('Recording start error:', error);
    }
  }, [model_type_transcription, startRealtimeRecording]);

  const stopRecording = useCallback((): Promise<string> => {
    // Check if using real-time transcription
    // Support both 'scribe_v2_realtime' and 'scribe_v2_realtime@elevenlabs' formats
    if (model_type_transcription?.includes('scribe_v2_realtime')) {
      return stopRealtimeRecording();
    }

    // Original MediaRecorder implementation for Whisper
    return new Promise((resolve, reject) => {
      if (!(mediaRecorderRef.current && state.isRecording)) {
        reject(new Error('No active recording'));
        return;
      }

      logger.info('Stopping recording...');

      mediaRecorderRef.current.onstop = async () => {
        try {
          setState((prev) => ({
            ...prev,
            isRecording: false,
            isTranscribing: true,
          }));

          // Stop all tracks in the stream
          if (streamRef.current) {
            for (const track of streamRef.current.getTracks()) {
              track.stop();
            }
            streamRef.current = null;
          }

          if (audioChunksRef.current.length === 0) {
            throw new Error('No audio data recorded');
          }

          const audioBlob = new Blob(audioChunksRef.current, {
            type: audioChunksRef.current[0]?.type || 'audio/webm',
          });

          logger.info('Audio blob created:', audioBlob.size, 'bytes, type:', audioBlob.type);

          if (audioBlob.size === 0) {
            throw new Error('Recorded audio is empty');
          }

          const result = await aiTranscriptionService.transcribe({ audioBlob });

          if (!result || !result.text) {
            throw new Error('No transcription text returned');
          }

          setState((prev) => ({ ...prev, isTranscribing: false, recordingDuration: 0 }));
          toast.success('Transcription completed');
          resolve(result.text);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Transcription failed';
          setState((prev) => ({
            ...prev,
            isTranscribing: false,
            error: errorMessage,
            recordingDuration: 0,
          }));
          toast.error(`Transcription failed: ${errorMessage}`);
          reject(error);
        } finally {
          audioChunksRef.current = [];
        }
      };

      mediaRecorderRef.current.stop();
    });
  }, [model_type_transcription, state.isRecording, stopRealtimeRecording]);

  const cancelRecording = useCallback(() => {
    if (!state.isRecording) return;

    // Cancel real-time recording
    // Support both 'scribe_v2_realtime' and 'scribe_v2_realtime@elevenlabs' formats
    if (model_type_transcription?.includes('scribe_v2_realtime')) {
      logger.info('[Realtime] Cancelling recording...');

      // Cleanup AudioWorklet
      audioWorkletRef.current?.disconnect();
      audioContextRef.current?.close();

      // Disconnect service
      realtimeServiceRef.current?.disconnect();

      // Stop stream
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
      }

      setState((prev) => ({
        ...prev,
        isRecording: false,
        isConnecting: false,
        error: null,
        recordingDuration: 0,
        partialTranscript: '',
      }));

      toast.info('Recording cancelled');
      return;
    }

    // Cancel MediaRecorder recording
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
      }
      setState((prev) => ({ ...prev, isRecording: false, error: null, recordingDuration: 0 }));
      audioChunksRef.current = [];
      toast.info('Recording cancelled');
    }
  }, [model_type_transcription, state.isRecording]);

  const retryInitialization = useCallback(() => {
    setState((prev) => ({ ...prev, isInitializing: true, error: null }));
  }, []);

  return {
    ...state,
    startRecording,
    stopRecording,
    cancelRecording,
    retryInitialization,
  };
}
