import './firebaseConfig';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import './i18n';

// Nettoyage des Service Workers existants
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(registration => registration.unregister());
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter future={{
      // @ts-ignore
      v7_startTransition: true,
      // @ts-ignore
      v7_relativeSplatPath: true
    }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);