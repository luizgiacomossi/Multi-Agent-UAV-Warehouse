import { InterfaceTheme, ThemeId, ThemeColors } from './ThemeTypes';

const THEME_STORAGE_KEY = 'nextarc_interface_theme_id';
const CUSTOM_ACCENT_KEY = 'nextarc_custom_accent_color';

export const THEMES: Record<ThemeId, InterfaceTheme> = {
  cyan: {
    id: 'cyan',
    name: 'NexTArc Cyan',
    description: 'Autonomous flight telemetry in electric cyan and slate',
    badge: 'Standard HUD',
    colors: {
      primary: '#06b6d4', // cyan-500
      primaryHover: '#0891b2', // cyan-600
      primaryMuted: 'rgba(6, 182, 212, 0.15)',
      primaryGlow: 'rgba(6, 182, 212, 0.35)',
      textAccent: '#22d3ee', // cyan-400
      bgApp: '#0f172a', // slate-900
      bgPanel: 'rgba(15, 23, 42, 0.92)',
      bgCard: 'rgba(2, 6, 23, 0.85)',
      border: 'rgba(51, 65, 85, 0.7)',
      borderAccent: 'rgba(6, 182, 212, 0.5)'
    }
  },
  amber: {
    id: 'amber',
    name: 'Industrial Amber',
    description: 'High-visibility warehouse operations & hazard awareness',
    badge: 'Industrial',
    colors: {
      primary: '#f59e0b', // amber-500
      primaryHover: '#d97706', // amber-600
      primaryMuted: 'rgba(245, 158, 11, 0.15)',
      primaryGlow: 'rgba(245, 158, 11, 0.35)',
      textAccent: '#fbbf24', // amber-400
      bgApp: '#18181b', // zinc-900
      bgPanel: 'rgba(24, 24, 27, 0.94)',
      bgCard: 'rgba(9, 9, 11, 0.85)',
      border: 'rgba(63, 63, 70, 0.7)',
      borderAccent: 'rgba(245, 158, 11, 0.5)'
    }
  },
  emerald: {
    id: 'emerald',
    name: 'Emerald Ops',
    description: 'Eco-routing, battery optimization & tactical efficiency',
    badge: 'Tactical',
    colors: {
      primary: '#10b981', // emerald-500
      primaryHover: '#059669', // emerald-600
      primaryMuted: 'rgba(16, 185, 129, 0.15)',
      primaryGlow: 'rgba(16, 185, 129, 0.35)',
      textAccent: '#34d399', // emerald-400
      bgApp: '#061a14', // deep emerald/dark
      bgPanel: 'rgba(6, 26, 20, 0.94)',
      bgCard: 'rgba(2, 13, 10, 0.85)',
      border: 'rgba(16, 185, 129, 0.3)',
      borderAccent: 'rgba(16, 185, 129, 0.5)'
    }
  },
  violet: {
    id: 'violet',
    name: 'Midnight Violet',
    description: 'Deep midnight blue with neon purple accents for low-glare work',
    badge: 'Night Mode',
    colors: {
      primary: '#8b5cf6', // purple-500
      primaryHover: '#7c3aed', // purple-600
      primaryMuted: 'rgba(139, 92, 246, 0.15)',
      primaryGlow: 'rgba(139, 92, 246, 0.35)',
      textAccent: '#a78bfa', // purple-400
      bgApp: '#0f0d23', // deep midnight
      bgPanel: 'rgba(15, 13, 35, 0.94)',
      bgCard: 'rgba(8, 7, 20, 0.85)',
      border: 'rgba(139, 92, 246, 0.3)',
      borderAccent: 'rgba(139, 92, 246, 0.5)'
    }
  },
  crimson: {
    id: 'crimson',
    name: 'Crimson Tactical',
    description: 'High-alert surveillance and safety incident priority monitoring',
    badge: 'High Alert',
    colors: {
      primary: '#ef4444', // red-500
      primaryHover: '#dc2626', // red-600
      primaryMuted: 'rgba(239, 68, 68, 0.15)',
      primaryGlow: 'rgba(239, 68, 68, 0.35)',
      textAccent: '#f87171', // red-400
      bgApp: '#140c0c', // dark carbon red
      bgPanel: 'rgba(24, 14, 14, 0.94)',
      bgCard: 'rgba(12, 6, 6, 0.85)',
      border: 'rgba(239, 68, 68, 0.3)',
      borderAccent: 'rgba(239, 68, 68, 0.5)'
    }
  },
  'high-contrast': {
    id: 'high-contrast',
    name: 'OLED High-Contrast',
    description: 'Absolute black background with crisp platinum white elements',
    badge: 'Accessibility',
    colors: {
      primary: '#ffffff',
      primaryHover: '#e2e8f0',
      primaryMuted: 'rgba(255, 255, 255, 0.15)',
      primaryGlow: 'rgba(255, 255, 255, 0.25)',
      textAccent: '#f8fafc',
      bgApp: '#000000',
      bgPanel: 'rgba(10, 10, 10, 0.96)',
      bgCard: 'rgba(0, 0, 0, 0.95)',
      border: 'rgba(255, 255, 255, 0.35)',
      borderAccent: 'rgba(255, 255, 255, 0.7)'
    }
  }
};

/**
 * Service managing global UI colors and theme custom properties.
 * Applies variables directly to document.documentElement.
 */
export class ThemeService {
  private static instance: ThemeService | null = null;
  private currentThemeId: ThemeId = 'cyan';
  private customAccent: string | null = null;
  private listeners: ((theme: InterfaceTheme, customAccent: string | null) => void)[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as ThemeId | null;
      if (savedTheme && THEMES[savedTheme]) {
        this.currentThemeId = savedTheme;
      }
      const savedAccent = localStorage.getItem(CUSTOM_ACCENT_KEY);
      if (savedAccent) {
        this.customAccent = savedAccent;
      }
      this.applyTheme(this.currentThemeId, this.customAccent);
    }
  }

  public static getInstance(): ThemeService {
    if (!ThemeService.instance) {
      ThemeService.instance = new ThemeService();
    }
    return ThemeService.instance;
  }

  public getTheme(): InterfaceTheme {
    return THEMES[this.currentThemeId] || THEMES.cyan;
  }

  public getThemeId(): ThemeId {
    return this.currentThemeId;
  }

  public getAvailableThemes(): InterfaceTheme[] {
    return Object.values(THEMES);
  }

  public getCustomAccent(): string | null {
    return this.customAccent;
  }

  public setTheme(themeId: ThemeId): void {
    if (!THEMES[themeId]) return;
    this.currentThemeId = themeId;
    if (typeof window !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, themeId);
    }
    this.applyTheme(this.currentThemeId, this.customAccent);
    this.notify();
  }

  public setCustomAccent(accentHex: string | null): void {
    this.customAccent = accentHex;
    if (typeof window !== 'undefined') {
      if (accentHex) {
        localStorage.setItem(CUSTOM_ACCENT_KEY, accentHex);
      } else {
        localStorage.removeItem(CUSTOM_ACCENT_KEY);
      }
    }
    this.applyTheme(this.currentThemeId, this.customAccent);
    this.notify();
  }

  public subscribe(listener: (theme: InterfaceTheme, customAccent: string | null) => void): () => void {
    this.listeners.push(listener);
    listener(this.getTheme(), this.customAccent);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    const theme = this.getTheme();
    this.listeners.forEach((l) => l(theme, this.customAccent));
  }

  private applyTheme(themeId: ThemeId, customAccent: string | null): void {
    if (typeof document === 'undefined') return;

    const theme = THEMES[themeId] || THEMES.cyan;
    const root = document.documentElement;

    const primary = customAccent || theme.colors.primary;
    const textAccent = customAccent || theme.colors.textAccent;
    const primaryGlow = customAccent ? `${customAccent}55` : theme.colors.primaryGlow;
    const borderAccent = customAccent ? `${customAccent}80` : theme.colors.borderAccent;
    const primaryMuted = customAccent ? `${customAccent}22` : theme.colors.primaryMuted;

    root.style.setProperty('--theme-primary', primary);
    root.style.setProperty('--theme-primary-hover', theme.colors.primaryHover);
    root.style.setProperty('--theme-primary-muted', primaryMuted);
    root.style.setProperty('--theme-primary-glow', primaryGlow);
    root.style.setProperty('--theme-text-accent', textAccent);
    root.style.setProperty('--theme-bg-app', theme.colors.bgApp);
    root.style.setProperty('--theme-bg-panel', theme.colors.bgPanel);
    root.style.setProperty('--theme-bg-card', theme.colors.bgCard);
    root.style.setProperty('--theme-border', theme.colors.border);
    root.style.setProperty('--theme-border-accent', borderAccent);

    root.setAttribute('data-theme', themeId);
    if (document.body) {
      document.body.style.backgroundColor = theme.colors.bgApp;
    }
  }
}
