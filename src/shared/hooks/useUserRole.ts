// src/hooks/useUserRole.ts
import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { auth, db } from '@/firebaseConfig';
import { permissionsByRole } from '@/roles-permissions';

type AnyRole = keyof typeof permissionsByRole | string;

const CANONICAL_ROLES = new Set([
  "admin_platforme", "admin_compagnie", "company_accountant", "agency_accountant",
  "chef_garage", "chefagence", "chefembarquement", "guichetier",
  "agency_fleet_controller", "financial_director",
]);

export const normalizeRole = (r?: string): AnyRole => {
  const raw = (r || "").toString().trim().toLowerCase();
  if (raw === "company_ceo") return "admin_compagnie";
  if (raw === "chefagence") return "chefAgence";
  if (raw === "chefembarquement") return "chefEmbarquement";
  if (raw === "agency_boarding_officer" || raw === "embarquement") return "chefEmbarquement";
  return CANONICAL_ROLES.has(raw) ? (raw as AnyRole) : "unauthenticated";
};

export function useUserRole() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AnyRole>('unauthenticated');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1) écoute auth
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setRole('unauthenticated');
        setLoading(false);
        return;
      }
      setLoading(true);

      // 2) écoute Firestore en temps réel (sécurisé)
      const ref = doc(db, 'users', u.uid);

      // Option : si tu veux éviter onSnapshot (coût), dé-commente le getDoc unique.
      // const snap = await getDoc(ref);
      // setRole(normalizeRole(snap.exists() ? (snap.data() as any).role : 'user'));
      // setLoading(false);
      // return;

      const unsubDoc = onSnapshot(
        ref,
        (snap) => {
          const r = normalizeRole(snap.exists() ? (snap.data() as any).role : undefined);
          setRole(r);
          setLoading(false);
        },
        () => {
          // fallback en cas d’erreur réseau : on tente un getDoc
          getDoc(ref).then((s) => {
            const r = normalizeRole(s.exists() ? (s.data() as any).role : undefined);
            setRole(r);
          }).finally(() => setLoading(false));
        }
      );

      return () => unsubDoc();
    });

    return () => unsubAuth();
  }, []);

  return { user, role, loading };
}
