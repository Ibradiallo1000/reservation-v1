import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './i18n';
import { BrowserRouter } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';

const root = ReactDOM.createRoot(document.getElementById('root')!);

function MainApp() {
  const {
    needRefresh,
    offlineReady,
    updateServiceWorker,
  } = useRegisterSW();

  return (
    <>
      <BrowserRouter basename="/">
        <App />
      </BrowserRouter>

      {offlineReady && (
        <div className="fixed bottom-4 right-4 bg-green-100 text-green-800 p-3 rounded-lg shadow-lg">
          ✅ L’application Teliya est prête à être utilisée hors ligne
        </div>
      )}
      {needRefresh && (
        <div className="fixed bottom-4 right-4 bg-blue-100 text-blue-800 p-3 rounded-lg shadow-lg flex gap-2">
          🔄 Nouvelle version disponible
          <button
            onClick={() => updateServiceWorker(true)}
            className="bg-blue-600 text-white px-3 py-1 rounded"
          >
            Mettre à jour
          </button>
        </div>
      )}
    </>
  );
}

root.render(
  <React.StrictMode>
    <MainApp />
  </React.StrictMode>
);
