import { ThemeConfig } from '../types';

export const getThemeConfig = (themeStyle: string): ThemeConfig => {
  const themes: Record<string, ThemeConfig> = {
    moderne: {
      colors: {
        primary: '#3B82F6',
        secondary: '#10B981',
        background: '#F9FAFB',
        text: '#111827',
      },
      typography: 'sans-serif',
      buttons: 'rounded-lg',
      effects: 'shadow-md hover:shadow-lg',
      borders: 'rounded-lg',
      animations: 'transition-all duration-300',
    },
    classique: {
      colors: {
        primary: '#2563EB',
        secondary: '#1E40AF',
        background: '#FFFFFF',
        text: '#1F2937',
      },
      typography: 'serif',
      buttons: 'rounded-sm',
      effects: 'shadow-sm',
      borders: 'border',
      animations: 'transition-colors duration-200',
    },
    sombre: {
      colors: {
        primary: '#F59E0B',
        secondary: '#F97316',
        background: '#111827',
        text: '#F3F4F6',
      },
      typography: 'sans-serif',
      buttons: 'rounded-md',
      effects: 'shadow-lg',
      borders: 'border border-gray-700',
      animations: 'transition-transform duration-300',
    },
    contraste: {
      colors: {
        primary: '#EF4444',
        secondary: '#F59E0B',
        background: '#FFFFFF',
        text: '#000000',
      },
      typography: 'sans-serif',
      buttons: 'rounded-full',
      effects: 'shadow-xl',
      borders: 'border-2 border-black',
      animations: 'hover:scale-105 transition-transform',
    },
    minimaliste: {
      colors: {
        primary: '#6B7280',
        secondary: '#9CA3AF',
        background: '#FFFFFF',
        text: '#374151',
      },
      typography: 'sans-serif',
      buttons: '',
      effects: '',
      borders: '',
      animations: '',
    },
    glassmorphism: {
      colors: {
        primary: 'rgba(59, 130, 246, 0.8)',
        secondary: 'rgba(16, 185, 129, 0.8)',
        background: 'rgba(255, 255, 255, 0.1)',
        text: '#FFFFFF',
      },
      typography: 'sans-serif',
      buttons: 'rounded-lg backdrop-blur-md',
      effects: 'backdrop-filter backdrop-blur-lg bg-opacity-20',
      borders: 'border border-white border-opacity-20',
      animations: 'transition-all duration-500',
    },
  };

  return themes[themeStyle] || themes.moderne;
};