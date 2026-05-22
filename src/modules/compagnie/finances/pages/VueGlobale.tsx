// src/pages/chef-comptable/VueGlobale.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { Building2, CheckCircle2, Clock, Landmark, Receipt, RefreshCw, Wallet } from "lucide-react";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { SectionCard } from "@/ui";

type AgencyRow = {
  id: string;
  name: string;
  ventesValidees: number;
  paiementsOnlineValides: number;
  totalEncaisse: number;
  depots: number;
  depenses: number;
  ecart: number;
  sessionsNonValidees: number;
};

type ControlTotals = {
  ventesValidees: number;
  paiementsOnlineValides: number;
  totalEncaisse: number;
  depots: number;
  depenses: number;
  ecart: number;
};

const EMPTY_TOTALS: ControlTotals = {
  ventesValidees: 0,
  paiementsOnlineValides: 0,
  totalEncaisse: 0,
  depots: 0,
  depenses: 0,
  ecart: 0,
};

const UNASSIGNED_AGENCY_ID = "__unassigned__";
const AGENCY_DEPOSIT_REFERENCE_TYPES = new Set(["agency_deposit"]);
const CONFIRMED_TRANSACTION_STATUSES = new Set(["confirmed", "received", "verified", "refunded"]);

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function toMillis(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "object") {
    const maybeTimestamp = value as { toDate?: () => Date; seconds?: number };
    if (typeof maybeTimestamp.toDate === "function") return maybeTimestamp.toDate().getTime();
    if (typeof maybeTimestamp.seconds === "number") return maybeTimestamp.seconds * 1000;
  }
  return null;
}

function isInRange(value: unknown, startMs: number, endMs: number): boolean {
  const ms = toMillis(value);
  return ms != null && ms >= startMs && ms <= endMs;
}

function isConfirmedFinancialTransaction(status: unknown): boolean {
  const s = String(status ?? "confirmed").toLowerCase();
  if (s === "pending" || s === "failed" || s === "rejected") return false;
  return CONFIRMED_TRANSACTION_STATUSES.has(s) || s === "";
}

function createEmptyRow(id: string, name: string): AgencyRow {
  return {
    id,
    name,
    ventesValidees: 0,
    paiementsOnlineValides: 0,
    totalEncaisse: 0,
    depots: 0,
    depenses: 0,
    ecart: 0,
    sessionsNonValidees: 0,
  };
}

function isClosedNotValidated(status: unknown): boolean {
  return String(status ?? "").toLowerCase() === "closed";
}

const VueGlobale: React.FC = () => {
  const { user } = useAuth() as any;
  const money = useFormatCurrency();
  const companyId = user?.companyId ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<AgencyRow[]>([]);
  const [totals, setTotals] = useState<ControlTotals>(EMPTY_TOTALS);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadFinancialControl = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { start, end } = todayRange();
      const startTs = Timestamp.fromDate(start);
      const endTs = Timestamp.fromDate(end);
      const startMs = start.getTime();
      const endMs = end.getTime();

      const agenciesSnap = await getDocs(collection(db, "companies", companyId, "agences"));
      const agencyRows = new Map<string, AgencyRow>();

      agenciesSnap.docs.forEach((agencyDoc) => {
        const data = agencyDoc.data() as { nomAgence?: string; nom?: string; name?: string; ville?: string };
        agencyRows.set(
          agencyDoc.id,
          createEmptyRow(agencyDoc.id, data.nomAgence ?? data.nom ?? data.name ?? data.ville ?? "Agence")
        );
      });

      const ensureRow = (agencyId: string | null | undefined) => {
        const id = agencyId && agencyId.trim() ? agencyId : UNASSIGNED_AGENCY_ID;
        if (!agencyRows.has(id)) {
          agencyRows.set(id, createEmptyRow(id, id === UNASSIGNED_AGENCY_ID ? "Flux siège" : "Agence inconnue"));
        }
        return agencyRows.get(id)!;
      };

      const [encaissementSnaps, paymentsSnap, transactionsSnap] = await Promise.all([
        Promise.all(
          agenciesSnap.docs.map((agencyDoc) =>
            getDocs(
              query(
                collection(db, "companies", companyId, "agences", agencyDoc.id, "comptaEncaissements"),
                where("createdAt", ">=", startTs),
                where("createdAt", "<=", endTs),
                limit(1000)
              )
            )
          )
        ),
        getDocs(
          query(
            collection(db, "companies", companyId, "payments"),
            where("validatedAt", ">=", startTs),
            where("validatedAt", "<=", endTs),
            limit(3000)
          )
        ),
        getDocs(
          query(
            collection(db, "companies", companyId, "financialTransactions"),
            where("performedAt", ">=", startTs),
            where("performedAt", "<=", endTs),
            limit(5000)
          )
        ),
      ]);

      encaissementSnaps.forEach((snap, index) => {
        const agencyIdFromPath = agenciesSnap.docs[index]?.id ?? "";
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data() as { type?: string; montant?: number; amount?: number; agencyId?: string };
          if (String(data.type ?? "encaissement") !== "encaissement") return;
          const amount = Math.max(0, Number(data.montant ?? data.amount ?? 0) || 0);
          if (amount <= 0) return;
          ensureRow(String(data.agencyId ?? agencyIdFromPath)).ventesValidees += amount;
        });
      });

      paymentsSnap.docs.forEach((docSnap) => {
        const data = docSnap.data() as {
          amount?: number;
          agencyId?: string;
          channel?: string;
          status?: string;
          validatedAt?: unknown;
        };
        if (String(data.status ?? "") !== "validated") return;
        if (String(data.channel ?? "").toLowerCase() !== "online") return;
        if (!isInRange(data.validatedAt, startMs, endMs)) return;
        const amount = Math.max(0, Number(data.amount ?? 0) || 0);
        if (amount <= 0) return;
        ensureRow(String(data.agencyId ?? "")).paiementsOnlineValides += amount;
      });

      transactionsSnap.docs.forEach((docSnap) => {
        const data = docSnap.data() as {
          amount?: number;
          agencyId?: string | null;
          type?: string;
          referenceType?: string;
          status?: string;
        };
        if (!isConfirmedFinancialTransaction(data.status)) return;
        const amount = Math.abs(Number(data.amount ?? 0) || 0);
        if (amount <= 0) return;

        const row = ensureRow(data.agencyId ?? null);
        const type = String(data.type ?? "").toLowerCase();
        const referenceType = String(data.referenceType ?? "").toLowerCase();

        if (type === "expense") {
          row.depenses += amount;
          return;
        }
        if (AGENCY_DEPOSIT_REFERENCE_TYPES.has(referenceType)) {
          row.depots += amount;
        }
      });

      await Promise.all(
        agenciesSnap.docs.flatMap((agencyDoc) => {
          const agencyId = agencyDoc.id;
          const row = ensureRow(agencyId);
          const shiftsRef = collection(db, "companies", companyId, "agences", agencyId, "shifts");
          const courierRef = collection(db, "companies", companyId, "agences", agencyId, "courierSessions");
          return [
            getDocs(query(shiftsRef, limit(250))).then((snap) => {
              snap.docs.forEach((d) => {
                const data = d.data() as { status?: string; closedAt?: unknown; endAt?: unknown; updatedAt?: unknown };
                const closedAt = data.closedAt ?? data.endAt ?? data.updatedAt;
                if (isClosedNotValidated(data.status) && isInRange(closedAt, startMs, endMs)) {
                  row.sessionsNonValidees += 1;
                }
              });
            }),
            getDocs(query(courierRef, limit(250))).then((snap) => {
              snap.docs.forEach((d) => {
                const data = d.data() as { status?: string; closedAt?: unknown; updatedAt?: unknown };
                const closedAt = data.closedAt ?? data.updatedAt;
                if (isClosedNotValidated(data.status) && isInRange(closedAt, startMs, endMs)) {
                  row.sessionsNonValidees += 1;
                }
              });
            }),
          ];
        })
      );

      const nextRows = Array.from(agencyRows.values())
        .map((row) => {
          const totalEncaisse = row.ventesValidees;
          const ecart = totalEncaisse - row.depots - row.depenses;
          return { ...row, totalEncaisse, ecart };
        })
        .sort((a, b) => {
          const followUpScore = Number(Math.abs(b.ecart) > 0) - Number(Math.abs(a.ecart) > 0);
          if (followUpScore !== 0) return followUpScore;
          return Math.abs(b.ecart) - Math.abs(a.ecart) || b.totalEncaisse - a.totalEncaisse;
        });

      const nextTotals = nextRows.reduce<ControlTotals>(
        (sum, row) => ({
          ventesValidees: sum.ventesValidees + row.ventesValidees,
          paiementsOnlineValides: sum.paiementsOnlineValides + row.paiementsOnlineValides,
          totalEncaisse: sum.totalEncaisse + row.totalEncaisse,
          depots: sum.depots + row.depots,
          depenses: sum.depenses + row.depenses,
          ecart: sum.ecart + row.ecart,
        }),
        EMPTY_TOTALS
      );

      setRows(nextRows);
      setTotals(nextTotals);
      setLastUpdated(new Date());
    } catch (e) {
      console.error("[VueGlobale] Controle financier:", e);
      setError(e instanceof Error ? e.message : "Impossible de charger le contrôle financier.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadFinancialControl();
  }, [loadFinancialControl]);

  const rowsWithRemainder = useMemo(() => rows.filter((row) => Math.abs(row.ecart) > 0.009), [rows]);
  const missingDepositRows = useMemo(
    () => rows.filter((row) => row.totalEncaisse > 0 && row.depots <= 0),
    [rows]
  );
  const rowsWithUnvalidatedSessions = useMemo(
    () => rows.filter((row) => row.sessionsNonValidees > 0),
    [rows]
  );
  const followUpCount = rowsWithRemainder.length + missingDepositRows.length + rowsWithUnvalidatedSessions.length;
  const hasRemainder = Math.abs(totals.ecart) > 0.009;

  const fmtMoney = (value: number) => money(value);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="mx-auto mb-3 h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-amber-500" />
          <div className="text-gray-600">Chargement du contrôle financier...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Contrôle des caisses du jour"
        icon={Wallet}
        description="Lecture séparée des caisses agences et des paiements en ligne déjà sécurisés."
        right={
          <button
            type="button"
            onClick={() => void loadFinancialControl()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Actualiser
          </button>
        }
      >
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div
            className={`rounded-xl border-2 p-5 ${
              hasRemainder ? "border-amber-300 bg-amber-50" : "border-emerald-300 bg-emerald-50"
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              {hasRemainder ? <Clock className="h-4 w-4 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              Reste à justifier
            </div>
            <div className={`mt-2 text-3xl font-bold ${hasRemainder ? "text-amber-700" : "text-emerald-700"}`}>
              {fmtMoney(totals.ecart)}
            </div>
            <p className="mt-2 text-sm text-gray-600">
              Montants de caisse agence non encore déposés ou utilisés.
            </p>
          </div>

          <div
            className={`rounded-xl border-2 p-5 ${
              rowsWithRemainder.length > 0 ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-white"
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Building2 className="h-4 w-4 text-gray-500" />
              Agences à suivre
            </div>
            <div className={`mt-2 text-3xl font-bold ${rowsWithRemainder.length > 0 ? "text-amber-700" : "text-gray-900"}`}>
              {rowsWithRemainder.length}
            </div>
            <p className="mt-2 text-sm text-gray-600">
              {rowsWithRemainder.length > 0 ? "Agences avec des montants à suivre." : "Aucun montant non déposé à suivre."}
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Contrôle des caisses par agence"
        icon={Building2}
        right={<span className="text-sm text-gray-600">{rows.length} agence{rows.length > 1 ? "s" : ""}</span>}
        noPad
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Agence</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Encaissé agence</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Dépôts</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Dépenses</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-700">Reste à justifier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => {
                const rowHasRemainder = Math.abs(row.ecart) > 0.009;
                return (
                  <tr key={row.id} className={rowHasRemainder ? "bg-amber-50/70" : "bg-white hover:bg-gray-50"}>
                    <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
                    <td className="px-4 py-3 text-right text-gray-900">{fmtMoney(row.totalEncaisse)}</td>
                    <td className="px-4 py-3 text-right text-gray-900">{fmtMoney(row.depots)}</td>
                    <td className="px-4 py-3 text-right text-gray-900">{fmtMoney(row.depenses)}</td>
                    <td className={`px-4 py-3 text-right font-bold ${rowHasRemainder ? "text-amber-700" : "text-emerald-700"}`}>
                      {fmtMoney(row.ecart)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Contrôle des caisses" icon={Wallet}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Receipt className="h-4 w-4" />
              Encaissement agence
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900">{fmtMoney(totals.totalEncaisse)}</div>
            <div className="mt-2 text-xs text-gray-500">
              Caisse agence validée uniquement, hors paiements en ligne.
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Landmark className="h-4 w-4" />
              Dépôts en banque
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900">{fmtMoney(totals.depots)}</div>
            <div className="mt-2 text-xs text-gray-500">Dépôts en banque enregistrés.</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Wallet className="h-4 w-4" />
              Dépenses enregistrées
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900">{fmtMoney(totals.depenses)}</div>
            <div className="mt-2 text-xs text-gray-500">Dépenses enregistrées.</div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Paiements en ligne (déjà sécurisés)" icon={Landmark}>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <div className="text-sm text-emerald-800">
            Paiements en ligne déjà sécurisés, hors circuit caisse agence.
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-900">
            {fmtMoney(totals.paiementsOnlineValides)}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Points à vérifier"
        icon={Clock}
        right={
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${followUpCount > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}>
            {followUpCount} point{followUpCount > 1 ? "s" : ""}
          </span>
        }
      >
        {followUpCount === 0 ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Aucun montant à justifier, aucun dépôt à suivre, aucune session fermée en attente de validation.
          </div>
        ) : (
          <div className="space-y-3">
            {rowsWithRemainder.map((row) => (
              <div key={`remainder-${row.id}`} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="font-semibold text-amber-900">Montant non encore déposé : {row.name}</div>
                <div className="mt-1 text-sm text-amber-800">
                  Montant non encore déposé ou utilisé : {fmtMoney(row.ecart)}
                </div>
              </div>
            ))}

            {missingDepositRows.map((row) => (
              <div key={`deposit-${row.id}`} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="font-semibold text-amber-900">Dépôt non encore enregistré : {row.name}</div>
                <div className="mt-1 text-sm text-amber-800">
                  {fmtMoney(row.totalEncaisse)} encaissé, aucun dépôt enregistré aujourd'hui.
                </div>
              </div>
            ))}

            {rowsWithUnvalidatedSessions.map((row) => (
              <div key={`session-${row.id}`} className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="font-semibold text-gray-900">Sessions non validées : {row.name}</div>
                <div className="mt-1 text-sm text-gray-700">
                  {row.sessionsNonValidees} session{row.sessionsNonValidees > 1 ? "s" : ""} fermée{row.sessionsNonValidees > 1 ? "s" : ""} en attente de validation.
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 text-xs text-gray-500">
          Dernière mise à jour : {lastUpdated ? lastUpdated.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "--"}
        </div>
      </SectionCard>
    </div>
  );
};

export default VueGlobale;
