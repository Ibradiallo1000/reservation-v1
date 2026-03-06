import React from 'react';
import { useTranslation } from 'react-i18next';

const LanguageSwitcher = () => {
  const { i18n } = useTranslation();

  const changeLanguage = (lng: string) => {
    try {
      localStorage.setItem('i18nextLng', lng);
    } catch {}
    i18n.changeLanguage(lng);
  };

  return (
    <div className="flex gap-2 text-sm">
      <button onClick={() => changeLanguage('fr')} className="hover:underline">🇫🇷</button>
      <button onClick={() => changeLanguage('en')} className="hover:underline">🇬🇧</button>
    </div>
  );
};

export default LanguageSwitcher;
