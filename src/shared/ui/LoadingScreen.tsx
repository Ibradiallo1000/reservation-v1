// ✅ COMPOSANT : LoadingScreen - Affiche un indicateur de chargement avec thème visuel

import React from 'react';

interface LoadingScreenProps {
  message?: string;
  colors: {
    primary: string;
    text: string;
    background: string;
  };
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ message = 'Chargement...', colors }) => {
  return (
    <div
      className="flex items-center justify-center min-h-screen text-lg"
      style={{ backgroundColor: colors.background, color: colors.text }}
    >
      <div
        className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 mr-4"
        style={{ borderColor: colors.primary }}
      ></div>
      {message}
    </div>
  );
};

export default LoadingScreen;
