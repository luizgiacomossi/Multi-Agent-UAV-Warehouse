import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Trash2,
  Languages,
  Radio,
  AlertCircle,
  CornerDownLeft,
  Cpu,
  Globe,
  Loader2,
  Bot,
  Settings,
  X,
  Wrench,
  CheckCircle2
} from 'lucide-react';
import { useSpeechRecognition, SpeechProviderType } from '../hooks/useSpeechRecognition';
import { AssistantProcessResult } from '../services/slm/OperatorAssistant';

export interface VoiceCommandBarProps {
  onSendCommand?: (command: string) => Promise<AssistantProcessResult | void> | void;
  defaultLanguage?: 'en-US';
  defaultProvider?: SpeechProviderType;
  lmStudioUrl?: string;
  onUpdateLMStudioUrl?: (url: string) => void;
  isLMStudioConnected?: boolean;
}

/**
 * Operator Voice & Text Command Bar with SLM Toolset integration.
 * Placed in the bottom-center of the screen.
 */
export const VoiceCommandBar: React.FC<VoiceCommandBarProps> = ({
  onSendCommand,
  defaultLanguage = 'en-US',
  defaultProvider = 'whisper-local',
  lmStudioUrl = 'http://localhost:1234/v1',
  onUpdateLMStudioUrl,
  isLMStudioConnected = false
}) => {
  const [inputText, setInputText] = useState('');
  const [lastCommands, setLastCommands] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [urlInput, setUrlInput] = useState(lmStudioUrl);
  const [isProcessingCommand, setIsProcessingCommand] = useState(false);
  const [assistantReply, setAssistantReply] = useState<AssistantProcessResult | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const {
    providerType,
    setProvider,
    isSupported,
    isListening,
    isProcessing: isAudioProcessing,
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

  // Whenever speech recognition yields transcript, sync it to the input field
  useEffect(() => {
    if (transcript) {
      setInputText(transcript);
    }
  }, [transcript]);

  const handleClear = () => {
    setInputText('');
    clearTranscript();
    inputRef.current?.focus();
  };

  const handleProviderToggle = () => {
    const nextProv: SpeechProviderType = providerType === 'whisper-local' ? 'web-speech' : 'whisper-local';
    setProvider(nextProv);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const commandToSend = (inputText + (interimTranscript ? ` ${interimTranscript}` : '')).trim();
    if (!commandToSend || isProcessingCommand) return;

    // Save to command history
    setLastCommands((prev) => [commandToSend, ...prev.slice(0, 9)]);

    setInputText('');
    clearTranscript();
    setIsProcessingCommand(true);

    try {
      if (onSendCommand) {
        const result = await onSendCommand(commandToSend);
        if (result && typeof result === 'object' && 'text' in result) {
          setAssistantReply(result);
        }
      }
    } catch (err: any) {
      console.error('Error executing assistant command:', err);
    } finally {
      setIsProcessingCommand(false);
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUpdateLMStudioUrl) {
      onUpdateLMStudioUrl(urlInput.trim());
    }
    setShowSettings(false);
  };

  const displayedText = inputText + (interimTranscript ? (inputText ? ` ${interimTranscript}` : interimTranscript) : '');

  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 w-full max-w-2xl px-4 pointer-events-auto">
      <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl p-3 shadow-2xl flex flex-col gap-2 transition-all duration-300">
        
        {/* Assistant Response Bubble (When SLM responds) */}
        {assistantReply && (
          <div className="p-3 rounded-xl bg-slate-950/80 border border-cyan-500/30 text-xs flex flex-col gap-1.5 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-cyan-400">
                <Bot size={15} />
                <span>NexTArc Operator AI (SLM)</span>
                {assistantReply.usedLocalFallback && (
                  <span className="text-[10px] font-normal px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Rule Engine
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setAssistantReply(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X size={14} />
              </button>
            </div>

            {/* Tools Executed Badges */}
            {assistantReply.toolsExecuted && assistantReply.toolsExecuted.length > 0 && (
              <div className="flex flex-wrap gap-1.5 my-1">
                {assistantReply.toolsExecuted.map((t, idx) => (
                  <span
                    key={idx}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-950/60 border border-blue-700/50 text-[10px] font-mono text-blue-300"
                  >
                    <Wrench size={10} className="text-blue-400" />
                    <span>{t.name}()</span>
                  </span>
                ))}
              </div>
            )}

            {/* Response Text */}
            <p className="text-slate-200 leading-relaxed whitespace-pre-line font-medium">
              {assistantReply.text}
            </p>
          </div>
        )}

        {/* Top Meta Bar */}
        <div className="flex items-center justify-between px-1 text-xs">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 font-semibold text-slate-300">
              <Radio size={14} className={isListening ? 'text-red-400 animate-pulse' : 'text-slate-400'} />
              <span>Voice & SLM Toolset Bar</span>
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
                  <span>Local Whisper</span>
                </>
              ) : (
                <>
                  <Globe size={11} className="text-emerald-400" />
                  <span>Web Speech</span>
                </>
              )}
            </button>

            {/* Recording / Processing Status */}
            {isListening ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/20 text-red-300 border border-red-500/30 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                Listening...
              </span>
            ) : isAudioProcessing ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <Loader2 size={10} className="animate-spin text-amber-400" />
                Whisper AI...
              </span>
            ) : isProcessingCommand ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                <Loader2 size={10} className="animate-spin text-cyan-400" />
                SLM Thinking...
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                Ready
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* LM Studio Connection Indicator */}
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-colors text-[11px]"
              title="Configure LM Studio local endpoint"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isLMStudioConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                }`}
              />
              <span className="font-mono text-[10px]">LM Studio</span>
              <Settings size={11} className="text-slate-400 ml-0.5" />
            </button>

            {/* Language Badge */}
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700/60 text-[11px]"
              title="Speech & SLM Language: English"
            >
              <Languages size={12} className="text-cyan-400" />
              <span>EN</span>
            </div>

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

        {/* LM Studio Endpoint Settings Drawer */}
        {showSettings && (
          <form
            onSubmit={handleSaveSettings}
            className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-2 text-xs"
          >
            <span className="text-slate-400 font-medium shrink-0">LM Studio URL:</span>
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="http://localhost:1234/v1"
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 font-mono text-[11px] focus:outline-none focus:border-cyan-500"
            />
            <button
              type="submit"
              className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-lg text-[11px]"
            >
              Save
            </button>
          </form>
        )}

        {/* Input & Action Form */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          {/* Microphone Action Button */}
          <button
            type="button"
            onClick={toggleListening}
            disabled={!isSupported || isAudioProcessing || isProcessingCommand}
            className={`relative flex items-center justify-center w-11 h-11 rounded-xl font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 ${
              isListening
                ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/30 scale-105'
                : isAudioProcessing || isProcessingCommand
                ? 'bg-amber-600 text-white cursor-wait opacity-80'
                : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-md'
            } ${!isSupported ? 'opacity-40 cursor-not-allowed' : ''}`}
            title={
              isListening
                ? 'Click to Stop Recording'
                : isAudioProcessing
                ? 'Transcribing audio...'
                : 'Click to Speak (Microphone)'
            }
          >
            {isListening ? (
              <>
                <span className="absolute inset-0 rounded-xl bg-red-500 animate-ping opacity-25" />
                <MicOff size={20} className="relative z-10" />
              </>
            ) : isAudioProcessing || isProcessingCommand ? (
              <Loader2 size={20} className="animate-spin relative z-10" />
            ) : (
              <Mic size={20} className="relative z-10" />
            )}
          </button>

          {/* Interactive Text Field */}
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={displayedText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                isListening
                  ? 'Listening to speech... Click mic when done to transcribe.'
                  : isAudioProcessing
                  ? 'Local Whisper AI is transcribing audio...'
                  : isProcessingCommand
                  ? 'SLM is interpreting command & invoking simulation tools...'
                  : 'Ask about tasks, drones, or give command (e.g. "how many tasks remain", "pause simulation")...'
              }
              className={`w-full bg-slate-950/80 border rounded-xl py-2.5 pl-3.5 pr-9 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${
                isListening
                  ? 'border-red-500/60 focus:ring-red-500/30'
                  : isAudioProcessing || isProcessingCommand
                  ? 'border-cyan-500/60 focus:ring-cyan-500/30'
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
            disabled={!displayedText.trim() || isAudioProcessing || isProcessingCommand}
            className="flex items-center justify-center gap-1.5 px-4 h-11 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 font-semibold rounded-xl border border-slate-700/70 transition-all text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            title="Send to SLM (Enter)"
          >
            {isProcessingCommand ? <Loader2 size={14} className="animate-spin" /> : <span>Ask SLM</span>}
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

        {/* Error Notice */}
        {errorMessage && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-950/40 border border-red-800/40 text-[11px] text-red-300">
            <AlertCircle size={12} className="text-red-400 shrink-0" />
            <span className="truncate">{errorMessage}</span>
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
