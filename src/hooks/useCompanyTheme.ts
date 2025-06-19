import { useMemo } from 'react';
import { getThemeConfig } from '../theme/themes';
import { safeTextColor, hexToRgba } from '../utils/color';
import { Company } from '../types/companyTypes';

const useCompanyTheme = (company?: Company | null) => {
  return useMemo(() => {
    const themeConfig = getThemeConfig(company?.themeStyle || 'moderne');
    
    const primaryColor = company?.couleurPrimaire || themeConfig.colors.primary;
    const secondaryColor = company?.couleurSecondaire || themeConfig.colors.secondary;
    const accentColor = company?.couleurAccent || '#FBBF24';
    const tertiaryColor = company?.couleurTertiaire || '#6366F1';

    return {
      config: themeConfig,
      colors: {
        primary: primaryColor,
        secondary: secondaryColor,
        accent: accentColor,
        tertiary: tertiaryColor,
        text: safeTextColor(primaryColor),
        background: themeConfig.colors.background
      },
      classes: {
        background: themeConfig.colors.background,
        text: themeConfig.colors.text,
        card: themeConfig.effects.includes('bg-opacity')
          ? `${themeConfig.effects} ${themeConfig.borders}`
          : `bg-white ${themeConfig.effects} ${themeConfig.borders}`,
        button: `${themeConfig.buttons} ${themeConfig.animations}`,
        input: `${themeConfig.borders} ${themeConfig.animations}`,
        header: themeConfig.effects.includes('backdrop-filter')
          ? `${themeConfig.effects} ${themeConfig.borders}`
          : `bg-white ${themeConfig.effects} ${themeConfig.borders}`,
        animations: themeConfig.animations
      }
    };
  }, [company]);
};

export default useCompanyTheme;