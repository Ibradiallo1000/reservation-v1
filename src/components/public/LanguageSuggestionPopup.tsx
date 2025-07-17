import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import i18n from '@/i18n';

interface LanguageSuggestionPopupProps {
  onSelectLanguage: (lang: 'fr' | 'en') => void;
  delayMs?: number;
}

const LanguageSuggestionPopup: React.FC<LanguageSuggestionPopupProps> = ({
  onSelectLanguage,
  delayMs = 5000,
}) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  const handleLanguageChange = (lang: 'fr' | 'en') => {
    i18n.changeLanguage(lang);
    onSelectLanguage(lang);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.4 }}
        className="fixed top-5 right-5 z-50 bg-white border border-gray-200 shadow-xl rounded-lg p-4 w-[300px] max-w-full"
      >
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-800">Choisissez votre langue</h3>
          <button
            onClick={() => setVisible(false)}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => handleLanguageChange('fr')}
            className="px-4 py-1.5 rounded-full text-sm font-medium shadow-sm"
            style={{ backgroundColor: '#facc15', color: '#000' }}
          >
            Français
          </button>
          <button
            onClick={() => handleLanguageChange('en')}
            className="px-4 py-1.5 rounded-full text-sm font-medium shadow-sm"
            style={{ backgroundColor: '#1e293b', color: '#fff' }}
          >
            English
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default LanguageSuggestionPopup;
