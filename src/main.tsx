// src/main.tsx
console.log("✅ L'application démarre depuis main.tsx");

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './i18n';

console.log("💡 main.tsx monté !");

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
