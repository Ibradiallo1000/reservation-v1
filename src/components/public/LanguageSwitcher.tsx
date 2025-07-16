// ✅ src/components/public/LanguageSwitcher.tsx
import React from 'react';
import i18n from '@/i18n';

const LanguageSwitcher: React.FC = () => {
  const changeLanguage = (lang: 'fr' | 'en') => {
    i18n.changeLanguage(lang);
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={() => changeLanguage('fr')}
        className="text-sm hover:underline"
      >
        FR
      </button>
      <span className="text-gray-400">|</span>
      <button
        onClick={() => changeLanguage('en')}
        className="text-sm hover:underline"
      >
        EN
      </button>
    </div>
  );
};

export default LanguageSwitcher;
