import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import AppRoutes from './AppRoutes';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Déclaration TypeScript pour la variable window
declare global {
  interface Window {
    __netlifyFixApplied?: boolean;
  }
}

function NetlifyRouterFix({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Solution améliorée pour Netlify
    if (location.pathname !== '/' && !window.__netlifyFixApplied) {
      window.__netlifyFixApplied = true;
      
      // Délai minimal pour garantir l'hydratation complète
      const timer = setTimeout(() => {
        navigate(location.pathname, {
          replace: true,
          state: { ...location.state, fromNetlify: true }
        });
      }, 50);

      return () => clearTimeout(timer);
    }
  }, [navigate, location]);

  return <>{children}</>;
}

function App() {
  // Gestion spécifique mobile
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
