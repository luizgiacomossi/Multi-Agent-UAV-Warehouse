import {
  ISpeechRecognizer,
  SpeechLanguage,
  SpeechRecognizerState,
  SpeechResultEvent,
  SpeechErrorEvent,
  SpeechProgressEvent
} from './SpeechService.types';
import { AudioRecorder } from './audioUtils';

/**
 * 100% Local In-Browser Speech Recognizer powered by OpenAI Whisper via Transformers.js & ONNX Web.
 * Operates in a dedicated Web Worker to ensure 60fps rendering in Three.js remains unaffected.
 * Implements ISpeechRecognizer adhering to Liskov Substitution Principle (LSP).
 */
export class LocalWhisperSpeechService implements ISpeechRecognizer {
  private worker: Worker | null = null;
  private recorder = new AudioRecorder();
  private state: SpeechRecognizerState = 'idle';
  private language: SpeechLanguage = 'en-US';
  private isModelReady = false;

  private resultListeners = new Set<(event: SpeechResultEvent) => void>();
  private errorListeners = new Set<(event: SpeechErrorEvent) => void>();
  private stateListeners = new Set<(state: SpeechRecognizerState) => void>();
  private progressListeners = new Set<(event: SpeechProgressEvent) => void>();

  constructor(defaultLanguage: SpeechLanguage = 'en-US') {
    this.language = defaultLanguage;
  }

  public isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const hasWorker = typeof Worker !== 'undefined';
    const hasMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const hasAudioCtx = !!(window.AudioContext || (window as any).webkitAudioContext);
    return hasWorker && hasMedia && hasAudioCtx;
  }

  public getState(): SpeechRecognizerState {
    return this.state;
  }

  public setLanguage(language: SpeechLanguage): void {
    this.language = language;
  }

  public async start(): Promise<void> {
    if (!this.isSupported()) {
      this.notifyError({
        error: 'not-supported',
        message: 'Local Whisper speech recognition is not supported in this browser.'
      });
      return;
    }

    if (this.state === 'listening' || this.state === 'processing') {
      return;
    }

    this.ensureWorker();

    try {
      await this.recorder.start();
      this.setState('listening');
    } catch (err: any) {
      this.setState('error');
      this.notifyError({
        error: 'mic-denied',
        message: err?.message || 'Microphone access was denied.'
      });
    }
  }

  public async stop(): Promise<void> {
    if (this.state !== 'listening') return;

    this.setState('processing');

    try {
      const pcm16k = await this.recorder.stop();

      if (!pcm16k || pcm16k.length === 0) {
        this.setState('idle');
        return;
      }

      this.ensureWorker();

      if (!this.isModelReady) {
        this.setState('loading-model');
        this.notifyProgress({
          status: 'Downloading / initializing local Whisper model (~39MB once)...',
          progress: 0
        });
      }

      // Delegate inference to Web Worker
      this.worker?.postMessage({
        type: 'TRANSCRIBE',
        audio: pcm16k,
        language: this.language
      });
    } catch (err: any) {
      this.setState('error');
      this.notifyError({
        error: 'stop-failed',
        message: err?.message || 'Failed to process audio.'
      });
    }
  }

  public abort(): void {
    this.recorder.abort();
    this.setState('idle');
  }

  public onResult(listener: (event: SpeechResultEvent) => void): () => void {
    this.resultListeners.add(listener);
    return () => this.resultListeners.delete(listener);
  }

  public onError(listener: (event: SpeechErrorEvent) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  public onStateChange(listener: (state: SpeechRecognizerState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  public onProgress(listener: (event: SpeechProgressEvent) => void): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  private ensureWorker(): void {
    if (this.worker) return;

    try {
      this.worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), {
        type: 'module'
      });

      this.worker.onmessage = (e: MessageEvent) => {
        const { type, text, error, data } = e.data;

        if (type === 'PROGRESS') {
          if (data && data.status) {
            const pct = typeof data.progress === 'number' ? Math.round(data.progress) : undefined;
            const file = data.file ? ` (${data.file})` : '';
            this.notifyProgress({
              status: `Loading model${file}... ${pct !== undefined ? `${pct}%` : ''}`,
              progress: pct
            });
          }
        } else if (type === 'READY') {
          this.isModelReady = true;
          this.setState('idle');
        } else if (type === 'TRANSCRIPT') {
          this.isModelReady = true;
          this.setState('idle');
          this.notifyResult({
            transcript: text || '',
            interimTranscript: '',
            isFinal: true
          });
        } else if (type === 'ERROR') {
          this.setState('error');
          this.notifyError({
            error: 'inference-error',
            message: error || 'Transcription failed.'
          });
        }
      };

      this.worker.onerror = (err) => {
        console.error('Whisper worker error:', err);
        this.setState('error');
        this.notifyError({
          error: 'worker-error',
          message: 'Error communicating with background Whisper worker.'
        });
      };
    } catch (err: any) {
      console.error('Failed to spawn Whisper worker:', err);
      this.notifyError({
        error: 'worker-spawn-failed',
        message: 'Could not create Web Worker for Whisper.'
      });
    }
  }

  private setState(newState: SpeechRecognizerState): void {
    if (this.state === newState) return;
    this.state = newState;
    this.stateListeners.forEach((listener) => listener(newState));
  }

  private notifyResult(event: SpeechResultEvent): void {
    this.resultListeners.forEach((listener) => listener(event));
  }

  private notifyError(event: SpeechErrorEvent): void {
    this.errorListeners.forEach((listener) => listener(event));
  }

  private notifyProgress(event: SpeechProgressEvent): void {
    this.progressListeners.forEach((listener) => listener(event));
  }
}
