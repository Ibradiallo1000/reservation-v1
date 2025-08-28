// src/hooks/useUserRole.ts
import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { auth, db } from '@/firebaseConfig';
import { permissionsByRole } from '@/roles-permissions';

type AnyRole = keyof typeof permissionsByRole | string;

export const normalizeRole = (r?: string): AnyRole => {
  const raw = (r || 'user').toString().trim();
  const lc = raw.toLowerCase();

  if (lc === 'chef_agence' || lc === 'chefagence') return 'chefAgence';
  if (lc === 'admin plateforme' || lc === 'admin_platforme') return 'admin_platforme';
  if (lc === 'admin compagnie' || lc === 'admin_compagnie') return 'admin_compagnie';
  if (lc === 'agent_courrier' || lc === 'agentcourrier') return 'agentCourrier';
  if (lc === 'superviseur') return 'superviseur';
  if (lc === 'guichetier') return 'guichetier';
  if (lc === 'comptable') return 'comptable';
  if (lc === 'compagnie') return 'compagnie';
  if (lc === 'embarquement') return 'embarquement';
  return 'user';
};

export function useUserRole() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AnyRole>('user');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1) écoute auth
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setRole('user');
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
          const r = normalizeRole(snap.exists() ? (snap.data() as any).role : 'user');
          setRole(r);
          setLoading(false);
        },
        () => {
          // fallback en cas d’erreur réseau : on tente un getDoc
          getDoc(ref).then((s) => {
            const r = normalizeRole(s.exists() ? (s.data() as any).role : 'user');
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
