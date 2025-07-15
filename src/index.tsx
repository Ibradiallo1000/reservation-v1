// ✅ src/index.tsx - Version finalement corrigée
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './i18n';

import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { Toaster, ToastOptions } from 'react-hot-toast';

// Nettoyage des Service Workers existants
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(registration => registration.unregister());
  });
}

// Configuration de base typée correctement
const toastOptions: ToastOptions = {
  position: 'top-center',
  duration: 5000,
  style: {
    maxWidth: '100%',
    wordBreak: 'break-word' as const,
  },
  // Note: Les options spécifiques (success/error) doivent être gérées lors de l'appel à toast()
};

const root = ReactDOM.createRoot(document.getElementById('root')!);

root.render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter 
        future={{
          // @ts-ignore
          v7_startTransition: true,
          // @ts-ignore
          v7_relativeSplatPath: true
        }}
      >
        <App />
        <Toaster 
          position="top-center"
          toastOptions={{
            style: {
              maxWidth: '100%',
              wordBreak: 'break-word' as const,
            },
          }}
        />
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);