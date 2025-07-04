// src/components/ui/ErrorScreen.tsx

import React from 'react';
import { NavigateFunction } from 'react-router-dom';
import { XCircle } from 'lucide-react';

interface ErrorScreenProps {
  error: string;
  navigate: NavigateFunction;
  slug?: string;
}

const ErrorScreen: React.FC<ErrorScreenProps> = ({ error, navigate, slug }) => (
  <div className="min-h-screen flex items-center justify-center p-4 bg-white">
    <div className="text-center max-w-md">
      <XCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
      <h1 className="text-xl font-bold text-red-600 mb-2">Une erreur est survenue</h1>
      <p className="text-gray-600 mb-6">{error}</p>
      <button
        onClick={() => navigate(`/${slug || ''}`)}
        className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition"
      >
        Retour à l'accueil
      </button>
    </div>
  </div>
);

export default ErrorScreen;
