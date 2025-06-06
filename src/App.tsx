// ✅ src/App.tsx
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext'; // ✅ Fournit user + loading
import AppRoutes from './AppRoutes'; // ✅ Toutes les routes centralisées

const App: React.FC = () => {
  return (
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
  );
};

export default App;
