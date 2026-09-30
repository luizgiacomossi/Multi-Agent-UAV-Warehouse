import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Trash2,
  Languages,
  Radio,
  Sparkles,
  AlertCircle,
  CornerDownLeft,
  Cpu,
  Globe,
  Loader2
} from 'lucide-react';
import { useSpeechRecognition, SpeechProviderType } from '../hooks/useSpeechRecognition';

export interface VoiceCommandBarProps {
  onSendCommand?: (command: string) => void;
  defaultLanguage?: 'en-US' | 'pt-BR';
  defaultProvider?: SpeechProviderType;
}

/**
 * Voice & Text Operator Command Panel
 * Placed in the bottom-center of the screen.
 * Follows Single Responsibility Principle (SRP) by delegating speech lifecycle to useSpeechRecognition.
 */
export const VoiceCommandBar: React.FC<VoiceCommandBarProps> = ({
  onSendCommand,
  defaultLanguage = 'en-US',
  defaultProvider = 'whisper-local'
}) => {
  const [inputText, setInputText] = useState('');
  const [lastCommands, setLastCommands] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const {
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
    toggleListening,
    setLanguage,
    clearTranscript
  } = useSpeechRecognition({
    initialProvider: defaultProvider,
    initialLanguage: defaultLanguage
  });

  // Whenever speech recognition yields transcript, sync it to the editable input field
  useEffect(() => {
    if (transcript) {
      setInputText(transcript);
    }
  }, [transcript]);

  const handleClear = () => {
    setInputText('');
    clearTranscript();
    setFeedbackNotice(null);
    inputRef.current?.focus();
  };

  const handleLanguageToggle = () => {
    const nextLang = language === 'en-US' ? 'pt-BR' : 'en-US';
    setLanguage(nextLang);
    setFeedbackNotice(`Language set to ${nextLang === 'en-US' ? 'English (US)' : 'Português (BR)'}`);
    setTimeout(() => setFeedbackNotice(null), 2500);
  };

  const handleProviderToggle = () => {
    const nextProv: SpeechProviderType = providerType === 'whisper-local' ? 'web-speech' : 'whisper-local';
    setProvider(nextProv);
    setFeedbackNotice(`Engine switched to: ${nextProv === 'whisper-local' ? 'Local Whisper (On-Device AI)' : 'Web Speech API'}`);
    setTimeout(() => setFeedbackNotice(null), 3000);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const commandToSend = (inputText + (interimTranscript ? ` ${interimTranscript}` : '')).trim();
    if (!commandToSend) return;

    console.log('[NexTArc Voice/Text Operator Input]:', commandToSend);

    // Save to command history
    setLastCommands((prev) => [commandToSend, ...prev.slice(0, 9)]);

    if (onSendCommand) {
      onSendCommand(commandToSend);
    }

    setFeedbackNotice(`Command captured: "${commandToSend}"`);
    setInputText('');
    clearTranscript();

    setTimeout(() => {
      setFeedbackNotice(null);
    }, 4000);
  };

  const displayedText = inputText + (interimTranscript ? (inputText ? ` ${interimTranscript}` : interimTranscript) : '');

  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 w-full max-w-2xl px-4 pointer-events-auto">
      {/* Floating Glassmorphic Container */}
      <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl p-3 shadow-2xl flex flex-col gap-2 transition-all duration-300">
        
        {/* Top Meta Bar */}
        <div className="flex items-center justify-between px-1 text-xs">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 font-semibold text-slate-300">
              <Radio size={14} className={isListening ? 'text-red-400 animate-pulse' : 'text-slate-400'} />
              <span>Operator Voice & Command Bar</span>
            </div>

            {/* Provider Pill */}
            <button
              type="button"
              onClick={handleProviderToggle}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
                providerType === 'whisper-local'
                  ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 hover:bg-indigo-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
              }`}
              title="Click to toggle between Local Whisper (Offline) and Web Speech API"
            >
              {providerType === 'whisper-local' ? (
                <>
                  <Cpu size={11} className="text-indigo-400" />
                  <span>Local Whisper (AI)</span>
                </>
              ) : (
                <>
                  <Globe size={11} className="text-emerald-400" />
                  <span>Web Speech API</span>
                </>
              )}
            </button>

            {/* Recording / Processing State Badge */}
            {isListening ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/20 text-red-300 border border-red-500/30 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                Listening...
              </span>
            ) : isProcessing ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <Loader2 size={10} className="animate-spin text-amber-400" />
                Processing...
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                Ready
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Language Switcher */}
            <button
              type="button"
              onClick={handleLanguageToggle}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-colors text-[11px]"
              title="Toggle Recognition Language"
            >
              <Languages size={12} className="text-cyan-400" />
              <span>{language === 'en-US' ? 'EN (US)' : 'PT (BR)'}</span>
            </button>

            {/* History Feed Toggle */}
            {lastCommands.length > 0 && (
              <button
                type="button"
                onClick={() => setShowHistory((h) => !h)}
                className="text-[11px] text-slate-400 hover:text-slate-200 underline decoration-slate-600 underline-offset-2"
              >
                {showHistory ? 'Hide feed' : `Recent (${lastCommands.length})`}
              </button>
            )}
          </div>
        </div>

        {/* Input & Action Form */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          {/* Microphone Action Button */}
          <button
            type="button"
            onClick={toggleListening}
            disabled={!isSupported || isProcessing}
            className={`relative flex items-center justify-center w-11 h-11 rounded-xl font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 ${
              isListening
                ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/30 scale-105'
                : isProcessing
                ? 'bg-amber-600 text-white cursor-wait opacity-80'
                : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-md'
            } ${!isSupported ? 'opacity-40 cursor-not-allowed' : ''}`}
            title={
              isListening
                ? 'Click to Stop Recording & Transcribe'
                : isProcessing
                ? 'Transcribing audio...'
                : 'Click to Speak (Microphone)'
            }
          >
            {isListening ? (
              <>
                <span className="absolute inset-0 rounded-xl bg-red-500 animate-ping opacity-25" />
                <MicOff size={20} className="relative z-10" />
              </>
            ) : isProcessing ? (
              <Loader2 size={20} className="animate-spin relative z-10" />
            ) : (
              <Mic size={20} className="relative z-10" />
            )}
          </button>

          {/* Real-time Transcription & Input Field */}
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={displayedText}
              onChange={(e) => {
                setInputText(e.target.value);
              }}
              placeholder={
                isListening
                  ? 'Listening to speech... Click mic when done to transcribe.'
                  : isProcessing
                  ? 'Local Whisper AI is transcribing audio...'
                  : 'Speak into mic or type operator command...'
              }
              className={`w-full bg-slate-950/80 border rounded-xl py-2.5 pl-3.5 pr-9 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${
                isListening
                  ? 'border-red-500/60 focus:ring-red-500/30'
                  : isProcessing
                  ? 'border-amber-500/60 focus:ring-amber-500/30'
                  : 'border-slate-700/80 focus:ring-cyan-500/40 focus:border-cyan-500/60'
              }`}
            />

            {/* Clear Button */}
            {displayedText && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
                title="Clear text"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!displayedText.trim() || isProcessing}
            className="flex items-center justify-center gap-1.5 px-4 h-11 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 font-semibold rounded-xl border border-slate-700/70 transition-all text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            title="Submit Command (Enter)"
          >
            <span>Submit</span>
            <CornerDownLeft size={14} />
          </button>
        </form>

        {/* Progress Notice (Model Download or Processing) */}
        {progressMessage && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-950/40 border border-indigo-800/40 text-[11px] text-indigo-300">
            <Loader2 size={12} className="text-indigo-400 animate-spin shrink-0" />
            <span className="truncate">{progressMessage}</span>
          </div>
        )}

        {/* Feedback / Transcription Notice */}
        {feedbackNotice && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-cyan-950/40 border border-cyan-800/40 text-[11px] text-cyan-300">
            <Sparkles size={12} className="text-cyan-400 shrink-0" />
            <span className="truncate">{feedbackNotice}</span>
          </div>
        )}

        {/* Error Notice */}
        {errorMessage && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-950/40 border border-red-800/40 text-[11px] text-red-300">
            <AlertCircle size={12} className="text-red-400 shrink-0" />
            <span className="truncate">{errorMessage}</span>
          </div>
        )}

        {/* Browser Support Warning */}
        {!isSupported && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-950/40 border border-amber-800/40 text-[11px] text-amber-300">
            <AlertCircle size={12} className="text-amber-400 shrink-0" />
            <span>Local audio / Web Worker is unavailable in this environment. You can still type commands manually in the input above.</span>
          </div>
        )}

        {/* Collapsible History Feed */}
        {showHistory && lastCommands.length > 0 && (
          <div className="mt-1 pt-2 border-t border-slate-800 flex flex-col gap-1 max-h-28 overflow-y-auto pr-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
              Recent Spoken & Typed Commands
            </span>
            {lastCommands.map((cmd, idx) => (
              <div
                key={idx}
                onClick={() => setInputText(cmd)}
                className="flex items-center justify-between text-xs px-2 py-1 rounded bg-slate-950/50 hover:bg-slate-800/80 text-slate-300 cursor-pointer border border-slate-800/60 transition-colors"
                title="Click to load into input"
              >
                <span className="truncate">{cmd}</span>
                <span className="text-[10px] text-slate-500 font-mono ml-2 shrink-0">#{lastCommands.length - idx}</span>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
};

export default VoiceCommandBar;
