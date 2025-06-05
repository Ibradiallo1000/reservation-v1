// src/App.tsx

import React, { useEffect } from 'react';
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import AppRoutes from './AppRoutes';

// ✅ Correction Netlify (F5 sur une route dynamique)
declare global {
  interface Window {
    __netlifyFixApplied?: boolean;
  }
}

function NetlifyRouterFix({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname !== '/' && !window.__netlifyFixApplied) {
      window.__netlifyFixApplied = true;

      const timer = setTimeout(() => {
        navigate(location.pathname, {
          replace: true,
          state: { ...location.state, fromNetlify: true },
        });
      }, 50);

      return () => clearTimeout(timer);
    }
  }, [navigate, location]);

  return <>{children}</>;
}

function App() {
  console.log("✅ App.tsx monté !");
  useEffect(() => {
    const mobilePath = sessionStorage.getItem('mobileRedirect');
    if (mobilePath && mobilePath !== '/') {
      sessionStorage.removeItem('mobileRedirect');
      window.history.replaceState(null, '', mobilePath);
    }
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <NetlifyRouterFix>
          <AppRoutes />
        </NetlifyRouterFix>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
