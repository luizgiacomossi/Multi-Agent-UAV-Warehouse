import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ISpeechRecognizer,
  SpeechLanguage,
  SpeechRecognizerState,
  SpeechResultEvent,
  SpeechErrorEvent,
  SpeechProgressEvent
} from '../services/speech/SpeechService.types';
import { WebSpeechRecognitionService } from '../services/speech/WebSpeechRecognitionService';
import { LocalWhisperSpeechService } from '../services/speech/LocalWhisperSpeechService';

export type SpeechProviderType = 'whisper-local' | 'web-speech';

interface UseSpeechRecognitionOptions {
  initialProvider?: SpeechProviderType;
  initialLanguage?: SpeechLanguage;
  onFinalResult?: (transcript: string) => void;
}

/**
 * Custom hook encapsulating speech recognition reactive state, provider switching, and lifecycle.
 * Adheres to Dependency Inversion (DIP) and Open/Closed (OCP) principles.
 */
export function useSpeechRecognition({
  initialProvider = 'whisper-local',
  initialLanguage = 'en-US',
  onFinalResult
}: UseSpeechRecognitionOptions = {}) {
  const [providerType, setProviderTypeState] = useState<SpeechProviderType>(initialProvider);
  const [recognizerState, setRecognizerState] = useState<SpeechRecognizerState>('idle');
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [language, setLanguageState] = useState<SpeechLanguage>(initialLanguage);

  // Lazy cache of service instances
  const servicesRef = useRef<{
    'whisper-local'?: LocalWhisperSpeechService;
    'web-speech'?: WebSpeechRecognitionService;
  }>({});

  const getService = useCallback(
    (type: SpeechProviderType): ISpeechRecognizer => {
      if (!servicesRef.current[type]) {
        if (type === 'whisper-local') {
          servicesRef.current[type] = new LocalWhisperSpeechService(language);
        } else {
          servicesRef.current[type] = new WebSpeechRecognitionService(language);
        }
      }
      return servicesRef.current[type]!;
    },
    [language]
  );

  const activeService = getService(providerType);
  const isSupported = activeService.isSupported();
  const isListening = recognizerState === 'listening';
  const isProcessing = recognizerState === 'processing' || recognizerState === 'loading-model';

  // Keep callback reference updated
  const onFinalResultRef = useRef(onFinalResult);
  useEffect(() => {
    onFinalResultRef.current = onFinalResult;
  }, [onFinalResult]);

  // Subscribe to active service events
  useEffect(() => {
    const service = activeService;

    const unsubState = service.onStateChange((state) => {
      setRecognizerState(state);
      if (state === 'idle') {
        setProgressMessage(null);
      }
    });

    const unsubResult = service.onResult((event: SpeechResultEvent) => {
      setInterimTranscript(event.interimTranscript);

      if (event.transcript) {
        setTranscript((prev) => {
          const trimmedPrev = prev.trim();
          const chunk = event.transcript.trim();
          const next = trimmedPrev ? `${trimmedPrev} ${chunk}` : chunk;
          if (onFinalResultRef.current) {
            onFinalResultRef.current(next);
          }
          return next;
        });
        setInterimTranscript('');
      }
    });

    const unsubError = service.onError((err: SpeechErrorEvent) => {
      setErrorMessage(err.message);
      setProgressMessage(null);
    });

    let unsubProgress: (() => void) | undefined;
    if (service.onProgress) {
      unsubProgress = service.onProgress((prog: SpeechProgressEvent) => {
        setProgressMessage(prog.status);
      });
    }

    return () => {
      unsubState();
      unsubResult();
      unsubError();
      if (unsubProgress) unsubProgress();
      service.abort();
    };
  }, [activeService]);

  const setProvider = useCallback(
    (newProvider: SpeechProviderType) => {
      if (newProvider === providerType) return;
      activeService.abort();
      setRecognizerState('idle');
      setErrorMessage(null);
      setProgressMessage(null);
      setProviderTypeState(newProvider);
    },
    [activeService, providerType]
  );

  const startListening = useCallback(() => {
    setErrorMessage(null);
    activeService.start();
  }, [activeService]);

  const stopListening = useCallback(() => {
    activeService.stop();
  }, [activeService]);

  const toggleListening = useCallback(() => {
    if (activeService.getState() === 'listening') {
      activeService.stop();
    } else {
      setErrorMessage(null);
      setProgressMessage(null);
      activeService.start();
    }
  }, [activeService]);

  const setLanguage = useCallback(
    (newLang: SpeechLanguage) => {
      setLanguageState(newLang);
      activeService.setLanguage(newLang);
    },
    [activeService]
  );

  const clearTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    setErrorMessage(null);
    setProgressMessage(null);
  }, []);

  return {
    providerType,
    setProvider,
    isSupported,
    isListening,
    isProcessing,
    recognizerState,
    transcript,
    interimTranscript,
    errorMessage,
    progressMessage,
    language,
    startListening,
    stopListening,
    toggleListening,
    setLanguage,
    clearTranscript,
    setTranscript
  };
}
