var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { jsx as _jsx } from "react/jsx-runtime";
// src/contexts/AuthContext.tsx
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
const AuthContext = createContext({
    user: null,
    loading: true,
    logout: () => __awaiter(void 0, void 0, void 0, function* () { }),
    refreshUser: () => __awaiter(void 0, void 0, void 0, function* () { }),
    hasPermission: () => false
});
// Rôles et permissions (à externaliser dans un fichier séparé si nécessaire)
const ROLES_PERMISSIONS = {
    admin: ['view_dashboard', 'manage_routes', 'manage_staff', 'view_finances'],
    manager: ['view_dashboard', 'manage_routes', 'view_finances'],
    agent: ['view_dashboard', 'access_ticketing'],
    superviseur: [
        'dashboard', 'reservations', 'guichet',
        'courriers', 'trajets', 'finances', 'statistiques'
    ],
    chefAgence: [
        'view_dashboard',
        'access_ticketing',
        'manage_routes',
        'manage_mail',
        'mail_send',
        'mail_receive',
        'view_finances',
        'manage_income',
        'manage_expenses',
        'manage_staff',
        'manage_bookings'
    ],
    user: []
};
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const fetchUserData = useCallback((firebaseUser) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        try {
            const docRef = doc(db, 'users', firebaseUser.uid);
            const docSnap = yield getDoc(docRef);
            if (!docSnap.exists()) {
                throw new Error('Document utilisateur non trouvé');
            }
            const data = docSnap.data();
            const userData = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || '',
                displayName: firebaseUser.displayName || data.nom || '',
                companyId: data.companyId || '',
                role: data.role || 'user',
                nom: data.nom || '',
                ville: data.ville || '',
                agencyId: data.agencyId || '',
                agencyName: data.agencyName || `${data.ville || 'Agence'} Principale`,
                lastLogin: ((_a = data.lastLogin) === null || _a === void 0 ? void 0 : _a.toDate()) || null,
                permissions: [...(data.permissions || []), ...(ROLES_PERMISSIONS[data.role] || [])]
            };
            setUser(userData);
            setLoading(false);
            return userData;
        }
        catch (error) {
            console.error('Erreur de chargement utilisateur:', error);
            setUser(null);
            setLoading(false);
            throw error;
        }
    }), []);
    const refreshUser = useCallback(() => __awaiter(void 0, void 0, void 0, function* () {
        if (auth.currentUser) {
            yield fetchUserData(auth.currentUser);
        }
    }), [fetchUserData]);
    const logout = useCallback(() => __awaiter(void 0, void 0, void 0, function* () {
        try {
            yield signOut(auth);
            setUser(null);
        }
        catch (error) {
            console.error('Erreur lors de la déconnexion:', error);
            throw error;
        }
    }), []);
    const hasPermission = useCallback((permission) => {
        var _a;
        if (!user)
            return false;
        if (user.role === 'admin')
            return true; // Les admins ont tous les droits
        return ((_a = user.permissions) === null || _a === void 0 ? void 0 : _a.includes(permission)) || false;
    }, [user]);
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                if (firebaseUser) {
                    yield fetchUserData(firebaseUser);
                }
                else {
                    setUser(null);
                }
            }
            catch (error) {
                console.error('Erreur auth state:', error);
                setUser(null);
            }
            finally {
                setLoading(false);
            }
        }));
        return () => unsubscribe();
    }, [fetchUserData]);
    return (_jsx(AuthContext.Provider, { value: {
            user,
            loading,
            logout,
            refreshUser,
            hasPermission
        }, children: children }));
};
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth doit être utilisé dans un AuthProvider');
    }
    return context;
};
export { AuthContext };
