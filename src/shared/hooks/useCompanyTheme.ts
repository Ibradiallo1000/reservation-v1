import { useMemo, useState, useEffect } from 'react';
import { getThemeConfig } from '@/theme/themes';
import { safeTextColor, hexToRgba } from '@/utils/color';
import { Company } from '@/types/companyTypes';

const THEME_STORAGE_KEY = "companyTheme";

const useCompanyTheme = (company?: Company | null) => {
  const [initialTheme, setInitialTheme] = useState(() => {
    const savedTheme = sessionStorage.getItem(THEME_STORAGE_KEY);
    return savedTheme ? JSON.parse(savedTheme) : null;
  });

  const theme = useMemo(() => {
    const themeConfig = getThemeConfig(company?.themeStyle || 'moderne');

    // Couleurs principales avec fallback de sécurité
    const primaryColor = company?.couleurPrimaire?.trim() || initialTheme?.colors?.primary || themeConfig.colors.primary || "#3B82F6";
    const secondaryColor = company?.couleurSecondaire?.trim() || initialTheme?.colors?.secondary || themeConfig.colors.secondary || "#6366F1";
    const accentColor = company?.couleurAccent?.trim() || initialTheme?.colors?.accent || "#FBBF24";
    const tertiaryColor = company?.couleurTertiaire?.trim() || initialTheme?.colors?.tertiary || "#6366F1";

    // Variantes
    const primaryLight = hexToRgba(primaryColor, 0.15);
    const primaryDark = hexToRgba(primaryColor, 0.85);

    // Sécurité contraste texte
    const rawTextPrimary = safeTextColor(primaryColor);
    const rawTextSecondary = safeTextColor(secondaryColor);

    const textPrimary = rawTextPrimary === '#FFFFFF' ? '#1e293b' : rawTextPrimary; 
    const textSecondary = rawTextSecondary === '#FFFFFF' ? '#64748b' : rawTextSecondary;

    // Vérifier le contraste pour les boutons (fallback intelligent)
    const buttonTextColor = safeTextColor(primaryColor);
    const buttonBg = primaryColor;
    const buttonBorder = primaryDark;

    const computedTheme = {
      config: themeConfig,
      colors: {
        primary: primaryColor,
        secondary: secondaryColor,
        accent: accentColor,
        tertiary: tertiaryColor,
        primaryLight,
        primaryDark,
        textPrimary,
        textSecondary,
        buttonText: buttonTextColor,
        buttonBg,
        buttonBorder,
        background: themeConfig.colors.background,
        text: textPrimary
      },
      classes: {
        background: themeConfig.colors.background,
        text: themeConfig.colors.text,
        card: `bg-white ${themeConfig.effects} ${themeConfig.borders}`,
        button: `text-[${buttonTextColor}] bg-[${buttonBg}] border-[${buttonBorder}] ${themeConfig.buttons} ${themeConfig.animations}`,
        input: `${themeConfig.borders} ${themeConfig.animations}`,
        header: `bg-white ${themeConfig.effects} ${themeConfig.borders}`,
        animations: themeConfig.animations
      }
    };

    // Alias pour compatibilité
    return {
      ...computedTheme,
      primary: computedTheme.colors.primary,
      secondary: computedTheme.colors.secondary,
      primaryLight: computedTheme.colors.primaryLight,
      primaryDark: computedTheme.colors.primaryDark,
      textPrimary: computedTheme.colors.textPrimary,
      textSecondary: computedTheme.colors.textSecondary,
    };
  }, [company, initialTheme]);

  // Sauvegarde session
  useEffect(() => {
    if (company?.couleurPrimaire && company?.couleurSecondaire) {
      sessionStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme));
    }
  }, [company, theme]);

  return theme;
};

export default useCompanyTheme;
