import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './i18n';
import './types';

// Composant pour gérer l'initialisation du router
const NetlifyRouterFix = () => {
  const [isRouterReady, setIsRouterReady] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setIsRouterReady(true);
    }, 50);

    return () => clearTimeout(timer);
  }, []);

  return isRouterReady ? <App /> : (
    <div className="fixed inset-0 flex items-center justify-center bg-white">
      {/* Votre loader ou logo ici */}
      <p>Chargement...</p>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <NetlifyRouterFix />
  </React.StrictMode>
);
