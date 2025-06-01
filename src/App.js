import { jsx as _jsx } from "react/jsx-runtime";
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import AppRoutes from './AppRoutes';
function App() {
    return (_jsx(BrowserRouter, { children: _jsx(AuthProvider, { children: _jsx(AppRoutes, {}) }) }));
}
export default App;
