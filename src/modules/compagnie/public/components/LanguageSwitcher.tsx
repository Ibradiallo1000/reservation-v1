// Language switcher: flag buttons, active state, persists via i18n (localStorage)
import React from 'react';
import { useTranslation } from 'react-i18next';

type LanguageSwitcherProps = {
  primaryColor?: string;
  secondaryColor?: string;
  /** light = default gray, dark = on dark glass, floating = minimal capsule header */
  variant?: 'light' | 'dark' | 'floating';
  /** when set (e.g. from header scroll), text/emoji use this color for progressive header */
  scrollTextColor?: string;
};

const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  primaryColor = '#334155',
  secondaryColor = '#6366f1',
  variant = 'light',
  scrollTextColor,
}) => {
  const { i18n } = useTranslation();
  const current = (i18n.language || 'fr').toLowerCase().split('-')[0];
  const isFr = current === 'fr';
  const activeCls = 'text-white';
  const inactiveCls =
    variant === 'floating'
      ? 'text-white/70 hover:text-white hover:bg-white/10'
      : variant === 'dark'
        ? 'text-white/80 hover:bg-white/10'
        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-neutral-800';
  const isScrolledLight = Boolean(scrollTextColor && scrollTextColor !== 'white' && scrollTextColor !== '#fff');
  const activeClsFloating = isScrolledLight ? 'bg-black/10' : 'bg-white/20 text-white';
  const buttonCls = variant === 'floating' ? 'px-2 py-1 rounded-md min-h-[36px] min-w-[36px]' : 'min-h-[44px] min-w-[44px] rounded-lg';

  const setFr = () => {
    i18n.changeLanguage('fr');
  };
  const setEn = () => {
    i18n.changeLanguage('en');
  };

  const baseStyle = {
    ['--teliya-primary' as string]: primaryColor,
    ['--teliya-secondary' as string]: secondaryColor,
    ...(variant === 'floating' && scrollTextColor ? { color: scrollTextColor } : {}),
  } as React.CSSProperties;

  return (
    <div className="flex items-center gap-1" style={baseStyle}>
      <button
        type="button"
        onClick={setFr}
        className={`flex items-center justify-center text-lg transition ${buttonCls} ${variant === 'floating' ? (isFr ? activeClsFloating : inactiveCls) : (isFr ? activeCls : inactiveCls)}`}
        style={isFr && variant === 'light' ? { backgroundColor: 'var(--teliya-secondary)' } : undefined}
        aria-label="Français"
        title="Français"
      >
        🇫🇷
      </button>
      <button
        type="button"
        onClick={setEn}
        className={`flex items-center justify-center text-lg transition ${buttonCls} ${variant === 'floating' ? (!isFr ? activeClsFloating : inactiveCls) : (!isFr ? activeCls : inactiveCls)}`}
        style={!isFr && variant === 'light' ? { backgroundColor: 'var(--teliya-secondary)' } : undefined}
        aria-label="English"
        title="English"
      >
        🇬🇧
      </button>
    </div>
  );
};

export default LanguageSwitcher;
