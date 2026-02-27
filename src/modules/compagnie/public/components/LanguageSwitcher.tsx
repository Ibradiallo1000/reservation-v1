// Language switcher: flag buttons, active state, persists via i18n (localStorage)
import React from 'react';
import { useTranslation } from 'react-i18next';

type LanguageSwitcherProps = {
  primaryColor?: string;
  secondaryColor?: string;
};

const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  primaryColor = '#334155',
  secondaryColor = '#6366f1',
}) => {
  const { i18n } = useTranslation();
  const current = (i18n.language || 'fr').toLowerCase().split('-')[0];
  const isFr = current === 'fr';
  const activeCls = 'text-white';
  const inactiveCls = 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-neutral-800';

  const setFr = () => {
    i18n.changeLanguage('fr');
  };
  const setEn = () => {
    i18n.changeLanguage('en');
  };

  return (
    <div
      className="flex items-center gap-1"
      style={
        {
          ['--teliya-primary' as string]: primaryColor,
          ['--teliya-secondary' as string]: secondaryColor,
        } as React.CSSProperties
      }
    >
      <button
        type="button"
        onClick={setFr}
        className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-lg transition ${isFr ? activeCls : inactiveCls}`}
        style={isFr ? { backgroundColor: 'var(--teliya-secondary)' } : undefined}
        aria-label="Français"
        title="Français"
      >
        🇫🇷
      </button>
      <button
        type="button"
        onClick={setEn}
        className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-lg transition ${!isFr ? activeCls : inactiveCls}`}
        style={!isFr ? { backgroundColor: 'var(--teliya-secondary)' } : undefined}
        aria-label="English"
        title="English"
      >
        🇬🇧
      </button>
    </div>
  );
};

export default LanguageSwitcher;
