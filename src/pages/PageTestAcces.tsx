import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '../roles-permissions';
import type { Role } from '../roles-permissions';

const PageTestAcces: React.FC = () => {
  const { user } = useAuth();

  if (!user) return <div className="p-6 text-red-600">Non connecté</div>;

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold">Test des accès</h2>
      <p>Rôle : <strong>{user.role}</strong></p>
      <p>Peut voir tableau de bord : {hasPermission(user.role as Role, 'dashboard') ? '✅ Oui' : '❌ Non'}</p>
      <p>Peut accéder aux trajets : {hasPermission(user.role as Role, 'trajets') ? '✅ Oui' : '❌ Non'}</p>
      <p>Peut gérer les courriers : {hasPermission(user.role as Role, 'courriers') ? '✅ Oui' : '❌ Non'}</p>
      <p>Peut accéder au guichet : {hasPermission(user.role as Role, 'guichet') ? '✅ Oui' : '❌ Non'}</p>
      <p>Rôle détecté : {user.role}</p>
      <p>Accès dashboard ? {hasPermission(user.role as Role, 'dashboard')}</p>

    </div>
  );
};

export default PageTestAcces;
