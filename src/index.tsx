// ✅ src/index.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './i18n';

import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext'; // si tu as un contexte Auth
import { Toaster } from 'react-hot-toast';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <App />
        <Toaster position="top-right" reverseOrder={false} />
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
