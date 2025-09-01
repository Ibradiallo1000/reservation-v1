import {
  doc, getDoc, runTransaction, serverTimestamp, collection
} from "firebase/firestore";
import { db } from "@/firebaseConfig";

/** Champs éditables par le guichet */
export type ReservationEditable = Partial<{
  clientNom: string;
  telephone: string;
  email: string | null;
  date: string;           // YYYY-MM-DD
  heure: string;          // HH:mm
  depart: string;
  arrivee: string;
  seatsGo: number;
  seatsReturn: number;
  montant: number;        // autorisé si tu veux recalculer
}>;

export type CancelOptions = {
  reason?: string;
  requestedByUid: string;
  requestedByName?: string | null;
};

export type ModifyOptions = {
  patch: ReservationEditable;
  requestedByUid: string;
  requestedByName?: string | null;
};

/** Journal d’audit (pour sécurité & traçabilité) */
async function writeAuditLog(basePath: string, payload: any) {
  const logsRef = collection(db, `${basePath}/reservationLogs`);
  const id = doc(logsRef); // auto-id
  await runTransaction(db, async (tx) => {
    tx.set(id, {
      ...payload,
      createdAt: serverTimestamp(),
    });
  });
}

/** Annuler un billet (statut → "annulé"). */
export async function cancelReservation(
  companyId: string,
  agencyId: string,
  reservationId: string,
  { reason, requestedByUid, requestedByName }: CancelOptions
) {
  const base = `companies/${companyId}/agences/${agencyId}`;
  const ref = doc(db, `${base}/reservations/${reservationId}`);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Réservation introuvable.");
    const data = snap.data() as any;

    // Garde-fous : on n’annule que les billets non annulés
    if (String(data.statut).toLowerCase() === "annulé") {
      return; // idempotent
    }

    // Exemple de restriction : n’annule que si "payé" (adapte à ton process)
    const allowed = ["payé", "en_attente", "paiement_en_cours", "preuve_recue"];
    if (!allowed.includes(String(data.statut))) {
      throw new Error(`Statut non annulable: ${data.statut}`);
    }

    tx.update(ref, {
      statut: "annulé",
      updatedAt: serverTimestamp(),
      cancelledAt: serverTimestamp(),
      cancelledBy: requestedByUid,
      cancelledByName: requestedByName || null,
      cancelReason: reason || "",
      // Optionnel: pour embarquement, on remet à en_attente
      statutEmbarquement: "en_attente",
      reportInfo: null,
      checkInTime: null,
    });

    await writeAuditLog(base, {
      type: "CANCEL",
      reservationId,
      prev: { statut: data.statut },
      next: { statut: "annulé" },
      reason: reason || "",
      by: { uid: requestedByUid, name: requestedByName || null },
    });
  });
}

/** Modifier un billet (patch partiel et audité). */
export async function modifyReservation(
  companyId: string,
  agencyId: string,
  reservationId: string,
  { patch, requestedByUid, requestedByName }: ModifyOptions
) {
  const base = `companies/${companyId}/agences/${agencyId}`;
  const ref = doc(db, `${base}/reservations/${reservationId}`);

  // Nettoyage des champs vides / coercition minimale
  const safePatch: any = {};
  const allowKeys: (keyof ReservationEditable)[] = [
    "clientNom","telephone","email","date","heure","depart","arrivee","seatsGo","seatsReturn","montant",
  ];
  for (const k of allowKeys) {
    if (patch[k] !== undefined) safePatch[k] = patch[k];
  }

  // Exemple : normaliser téléphone / quantités
  if (safePatch.telephone) {
    safePatch.telephone = String(safePatch.telephone).replace(/\D/g, "");
  }
  if (safePatch.seatsGo !== undefined) {
    safePatch.seatsGo = Math.max(0, Number(safePatch.seatsGo || 0));
  }
  if (safePatch.seatsReturn !== undefined) {
    safePatch.seatsReturn = Math.max(0, Number(safePatch.seatsReturn || 0));
  }

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Réservation introuvable.");
    const prev = snap.data() as any;

    // Exemple de restrictions : interdire de modifier un billet annulé
    if (String(prev.statut).toLowerCase() === "annulé") {
      throw new Error("Billet déjà annulé.");
    }

    // Si tu veux interdire changement de trajet si déjà embarqué
    if (prev.statutEmbarquement === "embarqué") {
      const fieldsThatChangeTrip = ["date","heure","depart","arrivee","seatsGo","seatsReturn"];
      if (fieldsThatChangeTrip.some(f => safePatch[f] !== undefined)) {
        throw new Error("Impossible de modifier le trajet après embarquement.");
      }
    }

    // Patch
    const next = {
      ...safePatch,
      updatedAt: serverTimestamp(),
      modifiedBy: requestedByUid,
      modifiedByName: requestedByName || null,
      // Si tu modifies date/heure/dep/arr, pense à maintenir 'trajetId' si tu relies par ID
      // Ici, on laisse tel quel. Tu peux recalculer/poser un nouvel ID si nécessaire.
    };

    tx.update(ref, next);

    await writeAuditLog(base, {
      type: "MODIFY",
      reservationId,
      patch: safePatch,
      by: { uid: requestedByUid, name: requestedByName || null },
      prevSnapshot: {
        date: prev.date, heure: prev.heure, depart: prev.depart, arrivee: prev.arrivee,
        clientNom: prev.clientNom, telephone: prev.telephone, seatsGo: prev.seatsGo, seatsReturn: prev.seatsReturn,
        montant: prev.montant, statut: prev.statut, statutEmbarquement: prev.statutEmbarquement,
      },
    });
  });
}
