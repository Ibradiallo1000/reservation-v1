/**
 * Script de migration — cohérence financière TELIYA.
 *
 * 1. Backfill paidAt : pour toute cashTransaction sans paidAt, définir paidAt = date (ou date de createdAt).
 * 2. Marquer orphelines : les transactions paid dont la réservation n'existe pas ou est annulée → status = orphan.
 *
 * Exécution (depuis la racine du projet, avec ts-node ou compilé) :
 *   npx ts-node --project tsconfig.json scripts/migrateFinancialConsistency.ts [companyId]
 * Si companyId est omis, le script liste les companies depuis Firestore (adapter selon votre accès).
 *
 * ATTENTION : exécuter sur une copie de sauvegarde ou en dev d'abord.
 */

import { getFirestore } from "firebase/firestore";
import { collection, getDocs, doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { initializeApp } from "firebase/app";

const CASH_TRANSACTIONS_COLLECTION = "cashTransactions";
const CASH_TRANSACTION_STATUS = { PAID: "paid", REFUNDED: "refunded", ORPHAN: "orphan" };

function getDb() {
  const firebaseConfig = process.env.FIREBASE_CONFIG
    ? JSON.parse(process.env.FIREBASE_CONFIG)
    : undefined;
  if (!firebaseConfig) {
    throw new Error("FIREBASE_CONFIG non défini. Exporter les variables Firebase ou utiliser .env.");
  }
  const app = initializeApp(firebaseConfig);
  return getFirestore(app);
}

function toDateStr(t: { toDate?: () => Date } | Date | string): string {
  if (!t) return new Date().toISOString().slice(0, 10);
  if (typeof t === "string") return t.slice(0, 10);
  if (typeof (t as { toDate?: () => Date }).toDate === "function") {
    const d = (t as { toDate: () => Date }).toDate();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  const d = t as Date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function runMigration(companyId: string, db: ReturnType<typeof getFirestore>) {
  const ref = collection(db, "companies", companyId, CASH_TRANSACTIONS_COLLECTION);
  const snap = await getDocs(ref);
  let backfillCount = 0;
  let orphanCount = 0;

  for (const d of snap.docs) {
    const data = d.data();
    const id = d.id;
    const status = (data.status ?? data.statut ?? "").toString();
    if (status === CASH_TRANSACTION_STATUS.REFUNDED) continue;

    const reservationId = (data.reservationId ?? "").toString();
    const locationId = (data.locationId ?? "").toString();

    if (!data.paidAt) {
      const paidAt = (data.date ?? toDateStr(data.createdAt ?? new Date())).toString().slice(0, 10);
      await updateDoc(d.ref, { paidAt, updatedAt: serverTimestamp() });
      backfillCount++;
    }

    if (status !== CASH_TRANSACTION_STATUS.PAID) continue;
    if (!reservationId || !locationId) {
      await updateDoc(d.ref, { status: CASH_TRANSACTION_STATUS.ORPHAN, updatedAt: serverTimestamp() });
      orphanCount++;
      continue;
    }

    const resRef = doc(db, "companies", companyId, "agences", locationId, "reservations", reservationId);
    const resSnap = await getDoc(resRef);
    if (!resSnap.exists()) {
      await updateDoc(d.ref, { status: CASH_TRANSACTION_STATUS.ORPHAN, updatedAt: serverTimestamp() });
      orphanCount++;
      continue;
    }
    const resData = resSnap.data();
    const resStatut = (resData?.statut ?? resData?.status ?? "").toString().toLowerCase();
    if (resStatut === "annule" || resStatut === "annulé" || resStatut.includes("rembourse")) {
      await updateDoc(d.ref, { status: CASH_TRANSACTION_STATUS.ORPHAN, updatedAt: serverTimestamp() });
      orphanCount++;
    }
  }

  return { backfillCount, orphanCount, total: snap.docs.length };
}

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.log("Usage: npx ts-node scripts/migrateFinancialConsistency.ts <companyId>");
    process.exit(1);
  }
  const db = getDb();
  console.log("Migration cohérence financière — companyId:", companyId);
  const result = await runMigration(companyId, db);
  console.log("Résultat:", result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
