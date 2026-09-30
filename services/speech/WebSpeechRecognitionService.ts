import {
  ISpeechRecognizer,
  SpeechLanguage,
  SpeechRecognizerState,
  SpeechResultEvent,
  SpeechErrorEvent
} from './SpeechService.types';

/**
 * Concrete implementation of ISpeechRecognizer using the browser Web Speech API.
 * Follows Single Responsibility Principle (SRP) by exclusively managing the browser speech recognition lifecycle.
 */
export class WebSpeechRecognitionService implements ISpeechRecognizer {
  private recognition: any | null = null;
  private state: SpeechRecognizerState = 'idle';
  private language: SpeechLanguage = 'en-US';

  private resultListeners = new Set<(event: SpeechResultEvent) => void>();
  private errorListeners = new Set<(event: SpeechErrorEvent) => void>();
  private stateListeners = new Set<(state: SpeechRecognizerState) => void>();

  constructor(defaultLanguage: SpeechLanguage = 'en-US') {
    this.language = defaultLanguage;
    this.initializeRecognition();
  }

  public isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }

  public getState(): SpeechRecognizerState {
    return this.state;
  }

  public setLanguage(language: SpeechLanguage): void {
    if (this.language === language) return;
    this.language = language;

    if (this.recognition) {
      const wasListening = this.state === 'listening';
      if (wasListening) {
        this.stop();
      }
      this.recognition.lang = language;
      if (wasListening) {
        this.start();
      }
    }
  }

  public start(): void {
    if (!this.recognition) {
      this.initializeRecognition();
    }

    if (!this.recognition) {
      this.notifyError({
        error: 'not-supported',
        message: 'Speech recognition is not supported in this browser.'
      });
      return;
    }

    if (this.state === 'listening') {
      return;
    }

    try {
      this.recognition.lang = this.language;
      this.recognition.start();
    } catch (err: any) {
      // In case start is called while in transition, stop and re-attempt
      try {
        this.recognition.stop();
        setTimeout(() => {
          this.recognition?.start();
        }, 100);
      } catch (innerErr: any) {
        this.notifyError({
          error: 'start-failed',
          message: innerErr?.message || 'Could not start microphone.'
        });
      }
    }
  }

  public stop(): void {
    if (!this.recognition || this.state === 'idle') return;
    try {
      this.recognition.stop();
    } catch (_) {}
    this.setState('idle');
  }

  public abort(): void {
    if (!this.recognition) return;
    try {
      this.recognition.abort();
    } catch (_) {}
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

  private initializeRecognition(): void {
    if (typeof window === 'undefined') return;

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      return;
    }

    const rec = new SpeechRecognitionAPI();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = this.language;

    rec.onstart = () => {
      this.setState('listening');
    };

    rec.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const res = event.results[i];
        if (res.isFinal) {
          finalTranscript += res[0].transcript;
        } else {
          interimTranscript += res[0].transcript;
        }
      }

      this.notifyResult({
        transcript: finalTranscript,
        interimTranscript,
        isFinal: !!finalTranscript
      });
    };

    rec.onerror = (event: any) => {
      const errorKey = event?.error || 'unknown';
      let message = 'Speech recognition error occurred.';

      if (errorKey === 'not-allowed') {
        message = 'Microphone permission denied by user or browser.';
        this.setState('error');
      } else if (errorKey === 'no-speech') {
        return; // Ignore normal quiet intervals
      } else if (errorKey === 'audio-capture') {
        message = 'No microphone device was detected.';
        this.setState('error');
      }

      this.notifyError({ error: errorKey, message });
    };

    rec.onend = () => {
      this.setState('idle');
    };

    this.recognition = rec;
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
}
