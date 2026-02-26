// src/routes/RoleLanding.tsx
import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const roleHome: Record<string, string> = {
  admin_platforme: "/admin/dashboard",
  admin_compagnie: "/compagnie/command-center",
  company_ceo: "/compagnie/command-center",
  chef_garage: "/compagnie/garage/dashboard",
  company_accountant: "/chef-comptable",
  financial_director: "/chef-comptable",
  chefAgence: "/agence/dashboard",
  agency_accountant: "/agence/comptabilite",
  guichetier: "/agence/guichet",
  chefEmbarquement: "/agence/boarding",
  agency_fleet_controller: "/agence/fleet",
};

export default function RoleLanding() {
  const { user } = useAuth() as any;
  const navigate = useNavigate();
  const { companyId } = useParams<{ companyId: string }>();

  useEffect(() => {
    const role = user?.role ? String(user.role) : "";
    let path = roleHome[role] ?? "/login";
    if (companyId && (path === "/compagnie/garage/dashboard" || path === "/compagnie/command-center")) {
      path = path === "/compagnie/garage/dashboard"
        ? `/compagnie/${companyId}/garage/dashboard`
        : `/compagnie/${companyId}/command-center`;
    }
    navigate(path, { replace: true });
  }, [user, navigate, companyId]);

  return null;
}
