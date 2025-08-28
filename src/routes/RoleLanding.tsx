// src/routes/RoleLanding.tsx
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const roleHome = {
  admin_platforme: '/admin',
  admin_compagnie: '/compagnie',
  chefAgence: '/agence',
  guichetier: '/agence/guichet',
  superviseur: '/supervision',
  agentCourrier: '/courriers',
  user: '/',
  comptable: '/compta',
  financier: '/finances', // ajuste cette route si besoin
} as const;

type KnownRole = keyof typeof roleHome;

export default function RoleLanding() {
  const { user } = useAuth() as any;
  const navigate = useNavigate();

  useEffect(() => {
    const role = (user?.role as KnownRole) || 'user';
    const path = roleHome[role] ?? '/';
    navigate(path, { replace: true });
  }, [user, navigate]);

  return null;
}
