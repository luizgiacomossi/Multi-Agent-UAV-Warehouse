/**
 * Speech Service Interfaces and Domain Types
 * Adheres to Interface Segregation Principle (ISP) and Dependency Inversion Principle (DIP).
 */

export type SpeechLanguage = 'en-US';

export type SpeechRecognizerState = 'idle' | 'listening' | 'loading-model' | 'processing' | 'error';

export interface SpeechResultEvent {
  transcript: string;
  interimTranscript: string;
  isFinal: boolean;
}

export interface SpeechErrorEvent {
  error: string;
  message: string;
}

export interface SpeechProgressEvent {
  status: string;
  progress?: number;
}

/**
 * Abstraction for speech recognition providers (WebSpeech API, Whisper, Cloud Speech, etc.)
 */
export interface ISpeechRecognizer {
  /**
   * Whether this speech recognition provider is supported in the current environment.
   */
  isSupported(): boolean;

  /**
   * Current operational state of the recognizer.
   */
  getState(): SpeechRecognizerState;

  /**
   * Configure the target speech language.
   */
  setLanguage(language: SpeechLanguage): void;

  /**
   * Start listening and recognizing speech.
   */
  start(): void;

  /**
   * Gracefully stop recognition and emit pending final results.
   */
  stop(): void;

  /**
   * Immediately abort recognition and discard results.
   */
  abort(): void;

  /**
   * Subscribe to speech results (both interim and final).
   * Returns an unsubscribe function.
   */
  onResult(listener: (event: SpeechResultEvent) => void): () => void;

  /**
   * Subscribe to speech recognition errors.
   * Returns an unsubscribe function.
   */
  onError(listener: (event: SpeechErrorEvent) => void): () => void;

  /**
   * Subscribe to state transitions.
   * Returns an unsubscribe function.
   */
  onStateChange(listener: (state: SpeechRecognizerState) => void): () => void;

  /**
   * Optional subscription to model loading / inference progress.
   */
  onProgress?(listener: (event: SpeechProgressEvent) => void): () => void;
}

/**
 * Text-to-Speech (TTS) configuration options.
 */
export interface TTSOptions {
  rate?: number; // Speed rate (0.5 to 2.0, default 1.0)
  pitch?: number; // Pitch (0 to 2, default 1.0)
  volume?: number; // Volume (0 to 1, default 1.0)
  voiceURI?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: any) => void;
}

/**
 * Contract for speech synthesis / text-to-speech services.
 * Follows Interface Segregation Principle (ISP).
 */
export interface ITextToSpeechService {
  isSupported(): boolean;
  speak(text: string, options?: TTSOptions): void;
  cancel(): void;
  pause(): void;
  resume(): void;
  isSpeaking(): boolean;
  getVoices(): SpeechSynthesisVoice[];
  setVoice(voiceURI: string): void;
  getSelectedVoice(): SpeechSynthesisVoice | null;
  onVoicesChanged?(listener: (voices: SpeechSynthesisVoice[]) => void): () => void;
}
