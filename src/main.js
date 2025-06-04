import { jsx as _jsx } from "react/jsx-runtime";
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import './i18n';
import './types';
// Composant pour gérer l'initialisation du router
const NetlifyRouterFix = () => {
    const [isRouterReady, setIsRouterReady] = React.useState(false);
    React.useEffect(() => {
        // Délai minimal pour garantir l'hydratation
        const timer = setTimeout(() => {
            setIsRouterReady(true);
        }, 50);
        return () => clearTimeout(timer);
    }, []);
    return isRouterReady ? _jsx(App, {}) : _jsx("div", { className: "fixed inset-0 flex items-center justify-center bg-white" });
};
ReactDOM.createRoot(document.getElementById('root')).render(_jsx(React.StrictMode, { children: _jsx(BrowserRouter, { children: _jsx(NetlifyRouterFix, {}) }) }));
