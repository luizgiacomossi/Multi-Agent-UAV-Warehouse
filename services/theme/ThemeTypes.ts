export type ThemeId = 'cyan' | 'amber' | 'emerald' | 'violet' | 'crimson' | 'high-contrast';

export interface ThemeColors {
  primary: string;
  primaryHover: string;
  primaryMuted: string;
  primaryGlow: string;
  textAccent: string;
  bgApp: string;
  bgPanel: string;
  bgCard: string;
  border: string;
  borderAccent: string;
}

export interface InterfaceTheme {
  id: ThemeId;
  name: string;
  description: string;
  badge: string;
  colors: ThemeColors;
}
