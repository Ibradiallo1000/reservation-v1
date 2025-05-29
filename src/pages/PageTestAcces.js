import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '../roles-permissions';
const PageTestAcces = () => {
    const { user } = useAuth();
    if (!user)
        return _jsx("div", { className: "p-6 text-red-600", children: "Non connect\u00E9" });
    return (_jsxs("div", { className: "p-6", children: [_jsx("h2", { className: "text-xl font-bold", children: "Test des acc\u00E8s" }), _jsxs("p", { children: ["R\u00F4le : ", _jsx("strong", { children: user.role })] }), _jsxs("p", { children: ["Peut voir tableau de bord : ", hasPermission(user.role, 'dashboard') ? '✅ Oui' : '❌ Non'] }), _jsxs("p", { children: ["Peut acc\u00E9der aux trajets : ", hasPermission(user.role, 'trajets') ? '✅ Oui' : '❌ Non'] }), _jsxs("p", { children: ["Peut g\u00E9rer les courriers : ", hasPermission(user.role, 'courriers') ? '✅ Oui' : '❌ Non'] }), _jsxs("p", { children: ["Peut acc\u00E9der au guichet : ", hasPermission(user.role, 'guichet') ? '✅ Oui' : '❌ Non'] }), _jsxs("p", { children: ["R\u00F4le d\u00E9tect\u00E9 : ", user.role] }), _jsxs("p", { children: ["Acc\u00E8s dashboard ? ", hasPermission(user.role, 'dashboard')] })] }));
};
export default PageTestAcces;
