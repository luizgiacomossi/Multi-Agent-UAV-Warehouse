import React, { useState, useEffect } from 'react';
import { X, Check, Palette, Sparkles, RotateCcw } from 'lucide-react';
import { ThemeService, THEMES } from '../services/theme/ThemeService';
import { InterfaceTheme, ThemeId } from '../services/theme/ThemeTypes';

interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_ACCENTS = [
  { name: 'Cyan', color: '#06b6d4' },
  { name: 'Sky Blue', color: '#0ea5e9' },
  { name: 'Emerald', color: '#10b981' },
  { name: 'Lime', color: '#84cc16' },
  { name: 'Amber', color: '#f59e0b' },
  { name: 'Orange', color: '#f97316' },
  { name: 'Crimson', color: '#ef4444' },
  { name: 'Rose', color: '#f43f5e' },
  { name: 'Violet', color: '#8b5cf6' },
  { name: 'Fuchsia', color: '#d946ef' },
  { name: 'Platinum', color: '#f8fafc' }
];

export const ThemeModal: React.FC<ThemeModalProps> = ({ isOpen, onClose }) => {
  const themeService = ThemeService.getInstance();
  const [currentTheme, setCurrentTheme] = useState<InterfaceTheme>(themeService.getTheme());
  const [customAccent, setCustomAccent] = useState<string | null>(themeService.getCustomAccent());

  useEffect(() => {
    const unsubscribe = themeService.subscribe((theme, accent) => {
      setCurrentTheme(theme);
      setCustomAccent(accent);
    });
    return unsubscribe;
  }, [themeService]);

  if (!isOpen) return null;

  const handleSelectTheme = (themeId: ThemeId) => {
    themeService.setTheme(themeId);
    themeService.setCustomAccent(null);
  };

  const handleSelectAccent = (hex: string) => {
    themeService.setCustomAccent(hex);
  };

  const handleResetAccent = () => {
    themeService.setCustomAccent(null);
  };

  const handleApply = () => {
    themeService.setTheme(currentTheme.id);
    if (customAccent) {
      themeService.setCustomAccent(customAccent);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
      <div
        className="w-full max-w-xl rounded-2xl p-6 shadow-2xl flex flex-col gap-5 border border-slate-700/80 max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: currentTheme.colors.bgPanel,
          borderColor: currentTheme.colors.border
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-700/50">
          <div className="flex items-center gap-2.5">
            <div
              className="p-2 rounded-xl text-white shadow-sm"
              style={{
                backgroundColor: customAccent || currentTheme.colors.primary,
                boxShadow: `0 0 16px ${currentTheme.colors.primaryGlow}`
              }}
            >
              <Palette size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Interface Color & Theme Settings
              </h2>
              <p className="text-xs text-slate-400">
                Customize visual themes, panel contrasts, and HUD telemetry accents
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800/80 transition-colors"
            title="Close theme settings"
          >
            <X size={18} />
          </button>
        </div>

        {/* Theme Presets */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
              Curated Theme Presets
            </span>
            <span className="text-[11px] text-slate-400">
              Active: <strong style={{ color: customAccent || currentTheme.colors.textAccent }}>{currentTheme.name}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {(Object.values(THEMES) as InterfaceTheme[]).map((t) => {
              const isSelected = currentTheme.id === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleSelectTheme(t.id)}
                  className={`p-3 rounded-xl border text-left flex flex-col gap-2 transition-all relative overflow-hidden group ${
                    isSelected
                      ? 'ring-2 ring-offset-2 ring-offset-slate-900 shadow-lg'
                      : 'hover:border-slate-500'
                  }`}
                  style={{
                    backgroundColor: t.colors.bgCard,
                    borderColor: isSelected ? t.colors.primary : t.colors.border,
                    boxShadow: isSelected ? `0 0 16px ${t.colors.primaryGlow}` : undefined
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {/* Color Preview Dots */}
                      <div className="flex items-center -space-x-1.5">
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-black/40 shadow-sm"
                          style={{ backgroundColor: t.colors.primary }}
                        />
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-black/40 shadow-sm"
                          style={{ backgroundColor: t.colors.textAccent }}
                        />
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-black/40 shadow-sm"
                          style={{ backgroundColor: t.colors.bgApp }}
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-100">{t.name}</span>
                    </div>

                    {isSelected && (
                      <span
                        className="flex items-center justify-center w-4 h-4 rounded-full text-white text-[10px]"
                        style={{ backgroundColor: t.colors.primary }}
                      >
                        <Check size={11} />
                      </span>
                    )}
                  </div>

                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    {t.description}
                  </p>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[9px] text-slate-500">
                    <span className="px-1.5 py-0.5 rounded bg-slate-800/80 font-mono text-slate-300">
                      {t.badge}
                    </span>
                    <span className="font-mono">{t.colors.primary}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Accent Color Palette */}
        <div className="flex flex-col gap-2.5 pt-2 border-t border-slate-700/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200 uppercase tracking-wider">
              <Sparkles size={13} className="text-amber-400" />
              <span>Custom Accent Color (Optional)</span>
            </div>
            {customAccent && (
              <button
                type="button"
                onClick={handleResetAccent}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
                title="Reset to theme default accent"
              >
                <RotateCcw size={11} />
                <span>Reset to Preset</span>
              </button>
            )}
          </div>

          <p className="text-xs text-slate-400">
            Override the primary accent color across buttons, indicators, charts, and flight telemetry.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {PRESET_ACCENTS.map((item) => {
              const isChosen = customAccent === item.color;
              return (
                <button
                  key={item.color}
                  type="button"
                  onClick={() => handleSelectAccent(item.color)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-all ${
                    isChosen
                      ? 'border-white ring-2 ring-white/50 text-white font-semibold'
                      : 'border-slate-700 hover:border-slate-500 text-slate-300 bg-slate-900/60'
                  }`}
                  style={{
                    backgroundColor: isChosen ? `${item.color}30` : undefined
                  }}
                  title={item.name}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span>{item.name}</span>
                </button>
              );
            })}

            {/* Color Input */}
            <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-700 hover:border-slate-500 bg-slate-900/60 text-xs text-slate-300 cursor-pointer">
              <span>Custom:</span>
              <input
                type="color"
                value={customAccent || currentTheme.colors.primary}
                onChange={(e) => handleSelectAccent(e.target.value)}
                className="w-5 h-5 rounded cursor-pointer bg-transparent border-0"
              />
            </label>
          </div>
        </div>

        {/* Live Preview Bar */}
        <div
          className="p-3 rounded-xl border flex items-center justify-between text-xs"
          style={{
            backgroundColor: currentTheme.colors.bgCard,
            borderColor: currentTheme.colors.borderAccent
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: customAccent || currentTheme.colors.primary }}
            />
            <span className="font-semibold text-slate-200">Live Preview:</span>
            <span
              className="px-2 py-0.5 rounded font-mono text-[11px]"
              style={{
                backgroundColor: currentTheme.colors.primaryMuted,
                color: customAccent || currentTheme.colors.textAccent,
                border: `1px solid ${currentTheme.colors.borderAccent}`
              }}
            >
              UAV Fleet Active
            </span>
          </div>
          <button
            type="button"
            onClick={handleApply}
            className="px-4 py-1.5 rounded-lg text-white font-medium shadow-md transition-all text-xs"
            style={{
              backgroundColor: customAccent || currentTheme.colors.primary
            }}
          >
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  );
};
