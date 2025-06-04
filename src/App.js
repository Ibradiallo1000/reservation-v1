import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import AppRoutes from './AppRoutes';
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
// Composant pour gérer les redirections Netlify
function NetlifyRouterFix({ children }) {
    const navigate = useNavigate();
    const location = useLocation();
    useEffect(() => {
        // Solution pour les liens directs et les refreshes
        if (location.pathname !== '/' && !window.__NETLIFY_FIX_APPLIED) {
            window.__NETLIFY_FIX_APPLIED = true;
            navigate(location.pathname, {
                replace: true,
                state: location.state
            });
        }
    }, [navigate, location]);
    return _jsx(_Fragment, { children: children });
}
function App() {
    return (_jsx(BrowserRouter, { children: _jsx(AuthProvider, { children: _jsx(NetlifyRouterFix, { children: _jsx(AppRoutes, {}) }) }) }));
}
export default App;
