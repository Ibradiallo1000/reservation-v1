// ✅ COMPOSANT : ErrorScreen - Affiche une erreur critique avec retour
import React from 'react';
import { useNavigate } from 'react-router-dom';

interface ErrorScreenProps {
  error: string;
  colors: {
    primary: string;
    background: string;
    text: string;
  };
  classes: any;
  t: (key: string) => string;
}

const ErrorScreen: React.FC<ErrorScreenProps> = ({ error, colors, classes, t }) => {
  const navigate = useNavigate();

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen p-4 text-center"
      style={{ background: colors.background, color: colors.text }}
    >
      <div className={`p-4 rounded-lg max-w-md ${classes.card}`}>
        <h2 className="text-xl font-bold mb-2">{t('error')}</h2>
        <p>{error}</p>
        <button
          onClick={() => navigate('/')}
          className={`mt-4 px-4 py-2 rounded ${classes.button}`}
          style={{ backgroundColor: colors.primary, color: colors.text }}
        >
          {t('backToHome')}
        </button>
      </div>
    </div>
  );
};

export default ErrorScreen;
