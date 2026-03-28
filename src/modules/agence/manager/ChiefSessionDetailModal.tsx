/**
 * Détail session chef d'agence — audit terrain (billetterie / courrier).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import { X } from "lucide-react";
import { db } from "@/firebaseConfig";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { shipmentsRef } from "@/modules/logistics/domain/firestorePaths";
import { ActionButton } from "@/ui";

export type ChiefSessionDetailTarget = {
  id: string;
  kind: "guichet" | "courrier";
  type: string;
  status: string;
  closedAt?: unknown;
  startAt?: unknown;
  openedAt?: unknown;
  createdAt?: unknown;
  userName?: string | null;
  userCode?: string | null;
  agentName?: string | null;
  agentCode?: string | null;
};

function toDateOrNull(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const maybe = v as { toDate?: () => Date; seconds?: number };
  if (typeof maybe.toDate === "function") {
    const d = maybe.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof maybe.seconds === "number") return new Date(maybe.seconds * 1000);
  return null;
}

function startAtOf(s: ChiefSessionDetailTarget): Date | null {
  return toDateOrNull(s.startAt) ?? toDateOrNull(s.openedAt) ?? toDateOrNull(s.createdAt);
}

function formatDurationFr(from: Date, to: Date): string {
  let ms = Math.max(0, to.getTime() - from.getTime());
  const h = Math.floor(ms / 3600000);
  ms -= h * 3600000;
  const m = Math.floor(ms / 60000);
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

function isReservationValid(statut: string): boolean {
  const s = statut.toLowerCase().trim();
  return s !== "annule" && s !== "annulation_en_attente" && s !== "invalide";
}

export type BilletterieRouteRow = { depart: string; arrivee: string; billets: number; montant: number };
export type CourrierNatureRow = { nature: string; nombre: number; montant: number };

export type ChiefSessionDetailModalProps = {
  open: boolean;
  session: ChiefSessionDetailTarget | null;
  companyId: string;
  agencyId: string;
  onClose: () => void;
};

export default function ChiefSessionDetailModal({
  open,
  session,
  companyId,
  agencyId,
  onClose,
}: ChiefSessionDetailModalProps) {
  const money = useFormatCurrency();
  const [nowTick, setNowTick] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [billetterieRows, setBilletterieRows] = useState<BilletterieRouteRow[]>([]);
  const [courrierRows, setCourrierRows] = useState<CourrierNatureRow[]>([]);
  /** Lignes billetterie valides ou colis courrier */
  const [operationCount, setOperationCount] = useState(0);
  const [totalBillets, setTotalBillets] = useState(0);
  const [totalMontant, setTotalMontant] = useState(0);

  const isBilletterie = useMemo(() => {
    if (!session) return false;
    return session.kind === "guichet" || session.type === "billetterie";
  }, [session]);

  const handleClose = useCallback(() => {
    setLoadError(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => setNowTick((x) => x + 1), 15000);
    return () => window.clearInterval(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  useEffect(() => {
    if (!open || !session || !companyId || !agencyId) {
      setBilletterieRows([]);
      setCourrierRows([]);
      setOperationCount(0);
      setTotalBillets(0);
      setTotalMontant(0);
      setLoadError(null);
      return;
    }

    if (isBilletterie) {
      const reservationsRef = collection(
        db,
        "companies",
        companyId,
        "agences",
        agencyId,
        "reservations"
      );
      const q = query(
        reservationsRef,
        where("createdInSessionId", "==", session.id),
        limit(500)
      );
      const unsub = onSnapshot(
        q,
        (snap) => {
          setLoadError(null);
          const byRoute = new Map<string, { billets: number; montant: number }>();
          let ops = 0;
          let billetsSum = 0;
          let montantSum = 0;
          for (const d of snap.docs) {
            const r = d.data() as Record<string, unknown>;
            if (String(r.canal ?? "").toLowerCase() !== "guichet") continue;
            const statut = String(r.statut ?? "");
            if (!isReservationValid(statut)) continue;
            ops += 1;
            const dep = String(r.depart ?? r.departureCity ?? r.departure ?? "").trim() || "—";
            const arr = String(r.arrivee ?? r.arrivalCity ?? r.arrival ?? "").trim() || "—";
            const key = `${dep}\u0001${arr}`;
            const b = Math.max(0, Number(r.seatsGo ?? 0) + Number(r.seatsReturn ?? 0));
            const m = Math.max(0, Number(r.montant ?? 0));
            billetsSum += b;
            montantSum += m;
            const cur = byRoute.get(key) ?? { billets: 0, montant: 0 };
            byRoute.set(key, { billets: cur.billets + b, montant: cur.montant + m });
          }
          const rows: BilletterieRouteRow[] = [...byRoute.entries()].map(([key, v]) => {
            const [depart, arrivee] = key.split("\u0001");
            return { depart, arrivee, billets: v.billets, montant: v.montant };
          });
          rows.sort((a, b) => b.montant - a.montant);
          setBilletterieRows(rows);
          setCourrierRows([]);
          setOperationCount(ops);
          setTotalBillets(billetsSum);
          setTotalMontant(montantSum);
        },
        (err) => {
          console.error("[ChiefSessionDetailModal] billetterie:", err);
          setLoadError("Impossible de charger le détail billetterie.");
          setBilletterieRows([]);
          setOperationCount(0);
          setTotalBillets(0);
          setTotalMontant(0);
        }
      );
      return () => unsub();
    }

    const col = shipmentsRef(db, companyId);
    const q = query(col, where("sessionId", "==", session.id), limit(400));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setLoadError(null);
        const byNature = new Map<string, { nombre: number; montant: number }>();
        let montantSum = 0;
        for (const d of snap.docs) {
          const row = d.data() as {
            nature?: string;
            transportFee?: number;
            insuranceAmount?: number;
          };
          const nature = String(row.nature ?? "Colis").trim() || "Colis";
          const m =
            Math.max(0, Number(row.transportFee ?? 0)) +
            Math.max(0, Number(row.insuranceAmount ?? 0));
          montantSum += m;
          const cur = byNature.get(nature) ?? { nombre: 0, montant: 0 };
          byNature.set(nature, { nombre: cur.nombre + 1, montant: cur.montant + m });
        }
        const rows: CourrierNatureRow[] = [...byNature.entries()].map(([nature, v]) => ({
          nature,
          nombre: v.nombre,
          montant: v.montant,
        }));
        rows.sort((a, b) => b.montant - a.montant);
        setCourrierRows(rows);
        setBilletterieRows([]);
        setOperationCount(snap.size);
        setTotalBillets(0);
        setTotalMontant(montantSum);
      },
      (err) => {
        console.error("[ChiefSessionDetailModal] courrier:", err);
        setLoadError("Impossible de charger le détail des colis.");
        setCourrierRows([]);
        setOperationCount(0);
        setTotalMontant(0);
      }
    );
    return () => unsub();
  }, [open, session, companyId, agencyId, isBilletterie]);

  const now = useMemo(() => new Date(), [nowTick, open]);
  const sessionStart = session ? startAtOf(session) : null;
  const durationLabel = sessionStart ? formatDurationFr(sessionStart, now) : "—";

  const agentLabel = session
    ? (() => {
        const name = String(session.userName ?? session.agentName ?? "—");
        const code = String(session.userCode ?? session.agentCode ?? "").trim();
        return code ? `${name} (${code})` : name;
      })()
    : "";

  if (!open || !session) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chief-session-detail-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        aria-label="Fermer"
        onClick={handleClose}
      />
      <div className="relative z-10 flex max-h-[min(90vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-slate-600 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-slate-700">
          <div className="min-w-0">
            <h2
              id="chief-session-detail-title"
              className="text-base font-semibold text-gray-900 dark:text-white"
            >
              Détail session — {isBilletterie ? "Billetterie" : "Courrier"}
            </h2>
            <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-slate-400">{agentLabel}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-4 py-3 text-sm">
          {loadError ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
              {loadError}
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/80 sm:grid-cols-3">
            <div>
              <div className="text-gray-500 dark:text-slate-400">Opérations enregistrées</div>
              <div className="font-semibold text-gray-900 dark:text-white">{operationCount}</div>
              {isBilletterie ? (
                <div className="text-[11px] text-gray-500 dark:text-slate-400">
                  {totalBillets} place{totalBillets !== 1 ? "s" : ""} au total
                </div>
              ) : null}
            </div>
            <div>
              <div className="text-gray-500 dark:text-slate-400">
                {isBilletterie ? "Montant des ventes (indicatif)" : "Montant courrier (indicatif)"}
              </div>
              <div className="font-semibold text-gray-900 dark:text-white">{money(totalMontant)}</div>
            </div>
            <div>
              <div className="text-gray-500 dark:text-slate-400">Durée session</div>
              <div className="font-semibold text-gray-900 dark:text-white">{durationLabel}</div>
            </div>
          </div>

          {isBilletterie ? (
            <>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                Billets par trajet
              </h3>
              {billetterieRows.length === 0 && !loadError ? (
                <p className="text-gray-500 dark:text-slate-400">
                  Aucun billet enregistré sur cette session.
                </p>
              ) : (
                <ul className="space-y-2">
                  {billetterieRows.map((row) => (
                    <li
                      key={`${row.depart}-${row.arrivee}`}
                      className="rounded-lg border border-gray-100 px-3 py-2 dark:border-slate-700"
                    >
                      <span className="font-medium text-gray-900 dark:text-white">
                        {row.depart} → {row.arrivee}
                      </span>
                      <span className="text-gray-600 dark:text-slate-300">
                        {" "}
                        : {row.billets} billet{row.billets !== 1 ? "s" : ""} / {money(row.montant)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                Colis par type
              </h3>
              {courrierRows.length === 0 && !loadError ? (
                <p className="text-gray-500 dark:text-slate-400">Aucun colis sur cette session.</p>
              ) : (
                <ul className="space-y-2">
                  {courrierRows.map((row) => (
                    <li
                      key={row.nature}
                      className="rounded-lg border border-gray-100 px-3 py-2 dark:border-slate-700"
                    >
                      <span className="font-medium text-gray-900 dark:text-white">{row.nature}</span>
                      <span className="text-gray-600 dark:text-slate-300">
                        {" "}
                        : {row.nombre} colis / {money(row.montant)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="border-t border-gray-100 px-4 py-3 dark:border-slate-700">
          <ActionButton type="button" variant="secondary" className="w-full" onClick={handleClose}>
            Fermer
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
