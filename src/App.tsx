// src/App.tsx
import React from "react";
import { AuthProvider } from "./contexts/AuthContext";
import AppRoutes from "./AppRoutes";
import UpdateBanner from "./UpdateBanner"; // ✅ Ajout

const App: React.FC = () => {
  return (
    <AuthProvider>
      {/* Toutes les routes */}
      <AppRoutes />

      {/* ✅ Bannière de mise à jour affichée globalement */}
      <UpdateBanner />
    </AuthProvider>
  );
};

export default App;
