/**
 * Profil affichage vendeur / agent pour une agence (guichet, compta agence).
 * Le code peut être sur users/{uid} ou sur companies/.../agences/.../users (équipe).
 */

import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/firebaseConfig';

export type AgencyStaffProfile = {
  name?: string;
  email?: string;
  code?: string;
};

function pickCode(d: Record<string, unknown>): string {
  return String(d.agentCode ?? d.staffCode ?? d.codeCourt ?? d.code ?? '').trim();
}

function pickName(d: Record<string, unknown>): string {
  return String(d.displayName ?? d.nom ?? d.name ?? d.agentName ?? '').trim();
}

function pickEmail(d: Record<string, unknown>): string {
  return String(d.email ?? '').trim();
}

/**
 * Résout nom / email / code court pour un UID dans le contexte d'une agence.
 */
export async function fetchAgencyStaffProfile(
  companyId: string,
  agencyId: string,
  uid: string
): Promise<AgencyStaffProfile> {
  if (!uid) return {};

  let fromRoot: AgencyStaffProfile = {};
  try {
    const us = await getDoc(doc(db, 'users', uid));
    if (us.exists()) {
      const ud = us.data() as Record<string, unknown>;
      const code = pickCode(ud);
      const name = pickName(ud);
      const email = pickEmail(ud);
      fromRoot = {
        ...(code ? { code } : {}),
        ...(name ? { name } : {}),
        ...(email ? { email } : {}),
      };
    }
  } catch {
    /* permission-denied ou réseau : tenter équipe agence */
  }

  if (fromRoot.code) return fromRoot;

  try {
    const usersRef = collection(db, 'companies', companyId, 'agences', agencyId, 'users');
    const snap = await getDocs(query(usersRef, where('uid', '==', uid)));
    if (!snap.empty) {
      const d = snap.docs[0].data() as Record<string, unknown>;
      const code = pickCode(d);
      const name = pickName(d);
      const email = pickEmail(d);
      return {
        code: code || fromRoot.code,
        name: name || fromRoot.name,
        email: email || fromRoot.email,
      };
    }
  } catch {
    /* ignore */
  }

  return fromRoot;
}
