// ✅ COMPOSANT : NotFoundScreen
// Affiche une page d'erreur 404 personnalisée avec retour à l'accueil

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';

interface NotFoundScreenProps {
  message?: string;
  primaryColor: string;
  buttonLabel?: string;
}

const NotFoundScreen: React.FC<NotFoundScreenProps> = ({
  message = "La page demandée est introuvable.",
  primaryColor,
  buttonLabel = "Retour à l'accueil",
}) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-md"
      >
        <AlertCircle className="mx-auto mb-4 h-16 w-16 text-red-500" />
        <h1 className="text-3xl font-bold mb-2">Erreur 404</h1>
        <p className="mb-6 text-gray-300">{message}</p>
        <button
          onClick={() => navigate('/')}
          className="px-6 py-3 rounded-lg font-semibold text-white transition shadow-lg"
          style={{ backgroundColor: primaryColor }}
        >
          {buttonLabel}
        </button>
      </motion.div>
    </div>
  );
};

export default NotFoundScreen;
