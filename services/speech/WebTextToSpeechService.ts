import { ITextToSpeechService, TTSOptions } from './SpeechService.types';

const STORAGE_VOICE_KEY = 'nextarc_tts_voice_uri';
const STORAGE_RATE_KEY = 'nextarc_tts_rate';

/**
 * Strips markdown symbols, URLs, asterisks, bullet points, technical drone IDs,
 * and emojis so that speech synthesis produces natural, fluid human-sounding sentences.
 */
export function sanitizeTextForSpeech(rawText: string): string {
  if (!rawText) return '';

  return (
    rawText
      // Remove emojis
      .replace(
        /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
        ''
      )
      // Convert markdown links [Label](url) to just Label
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Make technical IDs sound natural (e.g. drone-01 -> Drone 1)
      .replace(/\bdrone[_-]0*(\d+)\b/gi, 'Drone $1')
      // Pronounce ms / s units clearly
      .replace(/\b(\d+)\s*ms\b/gi, '$1 milliseconds')
      // Remove markdown bold/italic (**text** or *text*)
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      // Remove inline code backticks
      .replace(/`([^`]+)`/g, '$1')
      // Remove bullet points and list dashes
      .replace(/^[•\-\*]\s+/gm, '')
      .replace(/•/g, ', ')
      // Convert newlines and colons followed by lists to natural sentence pauses
      .replace(/:\s*\n/g, '. ')
      .replace(/[\r\n]+/g, '. ')
      // Clean duplicate punctuation and whitespace
      .replace(/\s+/g, ' ')
      .replace(/\.+/g, '.')
      .replace(/,\./g, '.')
      .trim()
  );
}

/**
 * Computes a quality score for a SpeechSynthesis voice.
 * Prioritizes modern, natural, enhanced, neural, and high-definition voices.
 * Strongly demotes obsolete robotic voices (e.g. Alex, Fred, Albert).
 */
export function scoreVoiceQuality(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase();

  // English-only priority for simulation operator
  if (!lang.startsWith('en')) {
    return -100;
  }

  // Retro/novelty robotic macOS voices to avoid
  const roboticNames = [
    'fred',
    'albert',
    'alex',
    'zarvox',
    'trinoids',
    'whisper',
    'bad news',
    'bahh',
    'bells',
    'boing',
    'cellos',
    'deranged',
    'good news',
    'hysterical',
    'pipe organ',
    'junior',
    'ralph',
    'kathy',
    'vicki',
    'bruce'
  ];

  if (roboticNames.some((r) => name === r || name.startsWith(`${r} `))) {
    return -50;
  }

  let score = 20;

  // Prefer standard US or British English
  if (lang === 'en-us' || lang === 'en_us') score += 15;
  else if (lang === 'en-gb' || lang === 'en_gb') score += 10;

  // High-fidelity neural keywords (present in macOS Enhanced, Edge Natural, Chrome Neural)
  if (name.includes('premium')) score += 100;
  if (name.includes('enhanced')) score += 85;
  if (name.includes('natural')) score += 75;
  if (name.includes('neural')) score += 65;
  if (name.includes('siri')) score += 60;

  // Browser remote / cloud voices (e.g. Google US English, Microsoft Natural)
  if (!voice.localService) score += 40;
  if (name.includes('google')) score += 35;

  // Known high-quality standard voices
  const highQualityNames = [
    'ava',
    'samantha',
    'allison',
    'zoe',
    'tom',
    'daniel',
    'serena',
    'oliver',
    'kate',
    'stephanie'
  ];
  if (highQualityNames.some((hq) => name.includes(hq))) {
    score += 25;
  }

  return score;
}

/**
 * Text-to-Speech service using native browser Web Speech API.
 * High-quality, zero-latency, local speech synthesis with natural voice prioritization.
 * Follows Single Responsibility (SRP) and Singleton patterns.
 */
export class WebTextToSpeechService implements ITextToSpeechService {
  private static instance: WebTextToSpeechService | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private selectedVoice: SpeechSynthesisVoice | null = null;
  private voiceListeners: ((voices: SpeechSynthesisVoice[]) => void)[] = [];
  private currentRate: number = 0.99; // Calm, clear, conversational default

  constructor() {
    if (typeof window !== 'undefined') {
      const savedRate = localStorage.getItem(STORAGE_RATE_KEY);
      if (savedRate) {
        const parsed = parseFloat(savedRate);
        if (!isNaN(parsed) && parsed >= 0.5 && parsed <= 2.0) {
          this.currentRate = parsed;
        }
      }
    }

    if (this.isSupported()) {
      this.loadVoices();
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = () => {
          this.loadVoices();
        };
      }
    }
  }

  public static getInstance(): WebTextToSpeechService {
    if (!WebTextToSpeechService.instance) {
      WebTextToSpeechService.instance = new WebTextToSpeechService();
    }
    return WebTextToSpeechService.instance;
  }

  public isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      'SpeechSynthesisUtterance' in window
    );
  }

  private loadVoices(): void {
    if (!this.isSupported()) return;
    const rawVoices = window.speechSynthesis.getVoices();
    if (!rawVoices || rawVoices.length === 0) return;

    // Filter to English voices and sort descending by quality score
    const englishVoices = rawVoices
      .filter((v) => v.lang.startsWith('en'))
      .sort((a, b) => scoreVoiceQuality(b) - scoreVoiceQuality(a));

    this.voices = englishVoices.length > 0 ? englishVoices : rawVoices;

    // Check if user previously saved a preferred voice
    const savedVoiceURI = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_VOICE_KEY) : null;
    if (savedVoiceURI) {
      const matched = this.voices.find((v) => v.voiceURI === savedVoiceURI);
      if (matched) {
        this.selectedVoice = matched;
      }
    }

    // Default to the top-scored voice if not set or invalid
    if (!this.selectedVoice && this.voices.length > 0) {
      this.selectedVoice = this.voices[0];
    }

    // Notify listeners
    this.voiceListeners.forEach((listener) => listener(this.voices));
  }

  public getVoices(): SpeechSynthesisVoice[] {
    if (this.voices.length === 0) {
      this.loadVoices();
    }
    return this.voices;
  }

  public getSelectedVoice(): SpeechSynthesisVoice | null {
    return this.selectedVoice;
  }

  public setVoice(voiceURI: string): void {
    const found = this.voices.find((v) => v.voiceURI === voiceURI);
    if (found) {
      this.selectedVoice = found;
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_VOICE_KEY, voiceURI);
      }
    }
  }

  public getRate(): number {
    return this.currentRate;
  }

  public setRate(rate: number): void {
    this.currentRate = Math.max(0.5, Math.min(2.0, rate));
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_RATE_KEY, String(this.currentRate));
    }
  }

  public onVoicesChanged(listener: (voices: SpeechSynthesisVoice[]) => void): () => void {
    this.voiceListeners.push(listener);
    if (this.voices.length > 0) {
      listener(this.voices);
    }
    return () => {
      this.voiceListeners = this.voiceListeners.filter((l) => l !== listener);
    };
  }

  public isSpeaking(): boolean {
    return this.isSupported() && window.speechSynthesis.speaking;
  }

  public pause(): void {
    if (this.isSupported()) {
      window.speechSynthesis.pause();
    }
  }

  public resume(): void {
    if (this.isSupported()) {
      window.speechSynthesis.resume();
    }
  }

  public cancel(): void {
    if (this.isSupported()) {
      window.speechSynthesis.cancel();
    }
  }

  public speak(text: string, options?: TTSOptions): void {
    if (!this.isSupported()) return;

    // Cancel any previous speech playback to prevent overlaps
    this.cancel();

    const cleanText = sanitizeTextForSpeech(text);
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'en-US';
    utterance.rate = options?.rate ?? this.currentRate;
    utterance.pitch = options?.pitch ?? 1.0;
    utterance.volume = options?.volume ?? 1.0;

    const activeVoice = options?.voiceURI
      ? this.voices.find((v) => v.voiceURI === options.voiceURI) || this.selectedVoice
      : this.selectedVoice;

    if (activeVoice) {
      utterance.voice = activeVoice;
    }

    if (options?.onStart) utterance.onstart = options.onStart;
    utterance.onend = () => {
      options?.onEnd?.();
    };
    utterance.onerror = (e) => {
      options?.onError?.(e);
    };

    window.speechSynthesis.speak(utterance);
  }
}
