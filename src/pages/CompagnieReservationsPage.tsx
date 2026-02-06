// =============================================
// src/pages/CompagnieReservationsPage.tsx
// =============================================
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
  onSnapshot,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import {
  FaChevronLeft,
  FaChevronRight,
  FaFilter,
  FaDownload,
  FaPrint,
} from "react-icons/fa";
import { saveAs } from "file-saver";
import useCompanyTheme from "@/hooks/useCompanyTheme";
import { usePageHeader } from "@/contexts/PageHeaderContext";

/* ----------------------------- Types ----------------------------------- */
interface Reservation {
  id: string;
  agencyId: string;
  nomClient?: string;
  telephone?: string;
  montant?: number;
  canal?: string; // "guichet" | "en ligne" | autre
  statut?: string;
  depart?: string;
  arrivee?: string;
  createdAt?: Date | null;
}

interface Agence {
  id: string;
  nom: string;    // nomAgence (ou fallback)
  ville?: string;
  pays?: string;
}

/* ------------------------- Helpers / format ----------------------------- */
const fmtXOF = (n: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "XOF",
    maximumFractionDigits: 0,
  }).format(n);

const cx = (...xs: (string | false | null | undefined)[]) =>
  xs.filter(Boolean).join(" ");

type PeriodKey = "day" | "week" | "month" | "custom";

/** bornes de période */
function getPeriodRange(
  key: PeriodKey,
  customStart?: string,
  customEnd?: string
): { start: Date; end: Date; label: string } {
  const now = new Date();
  const endOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23, 59, 59, 999
  );

  if (key === "day") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    return { start, end: endOfToday, label: "Aujourd’hui" };
  }
  if (key === "week") {
    // Lundi → Dimanche
    const d = new Date(now);
    const day = (d.getDay() + 6) % 7; // 0 = lundi
    const start = new Date(d);
    start.setDate(d.getDate() - day);
    start.setHours(0, 0, 0, 0);
    return { start, end: endOfToday, label: "Cette semaine" };
  }
  if (key === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const label = new Intl.DateTimeFormat("fr-FR", {
      month: "long",
      year: "numeric",
    }).format(start);
    return { start, end: endOfToday, label };
  }
  // custom
  const start = new Date(`${customStart}T00:00:00`);
  const end = new Date(`${customEnd}T23:59:59`);
  const label = `${start.toLocaleDateString("fr-FR")} → ${end.toLocaleDateString("fr-FR")}`;
  return { start, end, label };
}

/* ------------------------------ Page ----------------------------------- */
const CompagnieReservationsPage: React.FC = () => {
  const { user, company } = useAuth();
  const companyId = user?.companyId;
  const theme = useCompanyTheme(company);
  const { setHeader, resetHeader } = usePageHeader();

  // Période (par défaut: semaine)
  const defaultPeriod: PeriodKey = "week";
  const [period, setPeriod] = useState<PeriodKey>(defaultPeriod);
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  const { start, end, label } = useMemo(
    () => getPeriodRange(period, customStart, customEnd),
    [period, customStart, customEnd]
  );

  const [agences, setAgences] = useState<Agence[]>([]);
  const [groupedData, setGroupedData] = useState<
    { agencyId: string; reservations: Reservation[] }[]
  >([]);
  const [selectedAgencyId, setSelectedAgencyId] = useState<string | null>(null);

  const [loading, setLoading] = useState({ agences: true, reservations: true });
  const [showFilters, setShowFilters] = useState(false);

  // Filtres "détails"
  const [filterDepart, setFilterDepart] = useState("");
  const [filterArrivee, setFilterArrivee] = useState("");
  const [filterCanal, setFilterCanal] = useState<"tous" | "guichet" | "en ligne">("tous");

  // Pagination "détails"
  const [currentPage, setCurrentPage] = useState(1);
  const detailsPerPage = 10;

  /* ----------------------------- Data load ------------------------------ */
  // 1. Chargement des agences (une seule fois, pas en temps réel)
  useEffect(() => {
    if (!companyId) return;
    
    const loadAgences = async () => {
      setLoading((p) => ({ ...p, agences: true }));
      
      const agencesSnap = await getDocs(
        collection(db, "companies", companyId, "agences")
      );
      const a: Agence[] = agencesSnap.docs.map((doc) => ({
        id: doc.id,
        nom:
          (doc.data() as any).nomAgence ||
          (doc.data() as any).nom ||
          (doc.data() as any).ville ||
          "Agence",
        ville: (doc.data() as any).ville,
        pays: (doc.data() as any).pays,
      }));
      setAgences(a);
      setLoading((p) => ({ ...p, agences: false }));
    };
    
    loadAgences();
  }, [companyId]);

  // 2. Écoute en temps réel des réservations (pour toutes les agences)
  useEffect(() => {
    if (!companyId || agences.length === 0) return;

    setLoading((p) => ({ ...p, reservations: true }));

    const unsubscribers: Unsubscribe[] = [];
    const buckets: Record<string, Reservation[]> = {};

    agences.forEach((agence) => {
      const resRef = collection(
        db,
        "companies",
        companyId,
        "agences",
        agence.id,
        "reservations"
      );

      const qRange = query(
        resRef,
        where("createdAt", ">=", Timestamp.fromDate(start)),
        where("createdAt", "<=", Timestamp.fromDate(end))
      );

      const unsub = onSnapshot(qRange, (snap) => {
        const rows: Reservation[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            agencyId: agence.id,
            nomClient: data.nomClient,
            telephone: data.telephone,
            montant: data.montant || 0,
            canal: (data.canal || "").toLowerCase().includes("ligne")
              ? "en ligne"
              : "guichet",
            statut: data.statut,
            depart: data.depart || "",
            arrivee: data.arrivee || "",
            createdAt: data.createdAt?.toDate?.() || null,
          };
        });

        buckets[agence.id] = rows;

        const grouped = Object.keys(buckets).map((k) => ({
          agencyId: k,
          reservations: buckets[k],
        }));

        setGroupedData(grouped);
        setLoading((p) => ({ ...p, reservations: false }));
      });

      unsubscribers.push(unsub);
    });

    return () => {
      unsubscribers.forEach((u) => u());
    };
  }, [companyId, agences, start, end]);

  /* ---------------------------- Derived data ---------------------------- */
  const findAgency = (id?: string | null) =>
    agences.find((a) => a.id === id) || null;

  const findAgencyDisplay = (id?: string | null) => {
    const a = findAgency(id || null);
    if (!a) return "Agence inconnue";
    const loc =
      a.ville && a.pays ? ` · ${a.ville}, ${a.pays}` : a.ville ? ` · ${a.ville}` : "";
    return `${a.nom}${loc}`;
  };

  // Détails (liste agrégée par trajet)
  const aggregatedByTrajet = useMemo(() => {
    const rows =
      groupedData.find((g) => g.agencyId === selectedAgencyId)?.reservations ||
      [];
    // Filtres de la zone détails
    let filtered = rows;
    if (filterDepart)
      filtered = filtered.filter((r) =>
        (r.depart || "").toLowerCase().includes(filterDepart.toLowerCase())
      );
    if (filterArrivee)
      filtered = filtered.filter((r) =>
        (r.arrivee || "").toLowerCase().includes(filterArrivee.toLowerCase())
      );
    if (filterCanal !== "tous")
      filtered = filtered.filter(
        (r) => (r.canal || "").toLowerCase() === filterCanal
      );

    // Agrégation par "Départ → Arrivée"
    const map: Record<
      string,
      {
        trajet: string;
        billets: number;
        ca: number;
        guichet: number;
        enLigne: number;
        lastSale?: Date | null;
      }
    > = {};
    for (const r of filtered) {
      const key = `${r.depart || "?"} → ${r.arrivee || "?"}`;
      if (!map[key]) {
        map[key] = {
          trajet: key,
          billets: 0,
          ca: 0,
          guichet: 0,
          enLigne: 0,
          lastSale: null,
        };
      }
      map[key].billets += 1;
      map[key].ca += r.montant || 0;
      if (r.canal === "guichet") map[key].guichet += 1;
      else map[key].enLigne += 1;
      if (!map[key].lastSale || (r.createdAt && r.createdAt > map[key].lastSale)) {
        map[key].lastSale = r.createdAt || null;
      }
    }
    const arr = Object.values(map).sort((a, b) => b.ca - a.ca);
    return arr;
  }, [groupedData, selectedAgencyId, filterDepart, filterArrivee, filterCanal]);

  // Pagination des détails agrégés
  const totalPages = Math.ceil(aggregatedByTrajet.length / 10);
  const paginated = aggregatedByTrajet.slice(
    (currentPage - 1) * 10,
    currentPage * 10
  );

  // Totaux agence sélectionnée
  const totalsSelected = useMemo(() => {
    const rows =
      groupedData.find((g) => g.agencyId === selectedAgencyId)?.reservations ||
      [];
    const ca = rows.reduce((s, r) => s + (r.montant || 0), 0);
    const billets = rows.length;
    const guichet = rows.filter((r) => r.canal === "guichet").length;
    const enLigne = rows.filter((r) => r.canal === "en ligne").length;
    return { ca, billets, guichet, enLigne };
  }, [groupedData, selectedAgencyId]);

  /* ----------------------------- Export CSV ----------------------------- */
  const exportAggregatedCSV = () => {
    const rows = aggregatedByTrajet;
    if (rows.length === 0) return;
    const header = "Trajet,Billets,Guichet,En ligne,CA\n";
    const body = rows
      .map((r) => [`"${r.trajet}"`, r.billets, r.guichet, r.enLigne, r.ca].join(","))
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const agencyName = findAgency(selectedAgencyId || "")?.nom || "agence";
    saveAs(blob, `reservations-agregees-${agencyName}-${new Date().toISOString().slice(0,10)}.csv`);
  };

  /* -------------------- Header dynamique du layout ---------------------- */
  useEffect(() => {
    const actions = (
      <>
        {(["day","week","month"] as const).map((p) => (
          <button
            key={p}
            onClick={() => { setPeriod(p); setCurrentPage(1); setSelectedAgencyId(null); }}
            className={cx(
              "px-3 py-1 rounded-full text-sm border transition",
              period === p
                ? "bg-white text-gray-900"
                : "bg-white/10 backdrop-blur text-white border-white/30 hover:bg-white/20"
            )}
          >
            {p === "day" ? "Aujourd'hui" : p === "week" ? "Semaine" : "Mois"}
          </button>
        ))}

        <button
          onClick={() => setShowFilters((s) => !s)}
          className="ml-2 flex items-center px-3 py-1 rounded-full text-sm border bg-white/10 text-white hover:bg-white/20 border-white/30"
          title="Filtres & période personnalisée"
        >
          <FaFilter className="mr-2" />
          Filtres
        </button>

        {selectedAgencyId && (
          <>
            <button
              onClick={exportAggregatedCSV}
              className="flex items-center px-3 py-1 rounded-full text-sm border bg-white/10 text-white hover:bg-white/20 border-white/30"
            >
              <FaDownload className="mr-2" />
              Exporter
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center px-3 py-1 rounded-full text-sm bg-white text-gray-900 hover:bg-gray-100"
            >
              <FaPrint className="mr-2" />
              Imprimer
            </button>
          </>
        )}
      </>
    );

    setHeader({
      title: `Réservations — ${label}`,
      subtitle: selectedAgencyId ? findAgencyDisplay(selectedAgencyId) : "",
      actions,
      bg: `linear-gradient(90deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`,
      fg: "#fff",
    });

    return () => resetHeader();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label, selectedAgencyId, period, showFilters, theme.colors.primary, theme.colors.secondary]);

  /* ----------------------------- Rendering ------------------------------ */
  if (!companyId) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-2">Réservations</h1>
        <p className="text-sm text-muted-foreground">
          Impossible d'identifier la compagnie (companyId manquant).
        </p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen p-4 md:p-8"
      style={{
        background: "linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)",
      }}
    >
      <div className="max-w-7xl mx-auto">
        {/* Filtres haut (custom dates + filtres "détails") */}
        {showFilters && (
          <div
            className="rounded-2xl p-4 mb-6 border shadow-sm"
            style={{
              background: "rgba(255,255,255,0.55)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              borderColor: "rgba(0,0,0,0.08)",
            }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Période perso — Début</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full p-2 border rounded-md bg-white/70"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Période perso — Fin</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full p-2 border rounded-md bg-white/70"
                />
              </div>
              <div className="lg:col-span-2 flex items-end gap-2">
                <button
                  className="px-3 py-2 rounded-md border bg-white hover:bg-gray-50"
                  onClick={() => setPeriod("custom")}
                  disabled={!customStart || !customEnd}
                >
                  Appliquer
                </button>
                <button
                  className="px-3 py-2 rounded-md border bg-white hover:bg-gray-50"
                  onClick={() => {
                    setCustomStart("");
                    setCustomEnd("");
                    setPeriod(defaultPeriod);
                  }}
                >
                  Réinitialiser
                </button>
              </div>
            </div>

            {selectedAgencyId && (
              <>
                <hr className="my-4" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Départ</label>
                    <input
                      placeholder="ex: Bamako"
                      value={filterDepart}
                      onChange={(e) => { setFilterDepart(e.target.value); setCurrentPage(1); }}
                      className="w-full p-2 border rounded-md bg-white/70"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Arrivée</label>
                    <input
                      placeholder="ex: Ségou"
                      value={filterArrivee}
                      onChange={(e) => { setFilterArrivee(e.target.value); setCurrentPage(1); }}
                      className="w-full p-2 border rounded-md bg-white/70"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Canal</label>
                    <select
                      value={filterCanal}
                      onChange={(e) => { setFilterCanal(e.target.value as any); setCurrentPage(1); }}
                      className="w-full p-2 border rounded-md bg-white/70"
                    >
                      <option value="tous">Tous</option>
                      <option value="guichet">Guichet</option>
                      <option value="en ligne">En ligne</option>
                    </select>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Cartes agences (glass) */}
        {loading.agences || loading.reservations ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6 mb-8">
              {groupedData.map((group) => {
                const a = findAgency(group.agencyId);
                const ca = group.reservations.reduce((s, r) => s + (r.montant || 0), 0);
                const billets = group.reservations.length;
                const guichet = group.reservations.filter((r) => r.canal === "guichet").length;
                const enLigne = billets - guichet;
                const pGuichet = billets ? Math.round((guichet / billets) * 100) : 0;

                return (
                  <div
                    key={group.agencyId}
                    onClick={() => {
                      setSelectedAgencyId(selectedAgencyId === group.agencyId ? null : group.agencyId);
                      setCurrentPage(1);
                    }}
                    className={cx(
                      "relative p-6 rounded-2xl cursor-pointer transition-all",
                      "border shadow-sm hover:shadow-lg"
                    )}
                    style={{
                      background: "rgba(255,255,255,0.58)",
                      backdropFilter: "blur(12px)",
                      WebkitBackdropFilter: "blur(12px)",
                      borderColor:
                        selectedAgencyId === group.agencyId
                          ? theme.colors.secondary
                          : "rgba(0,0,0,0.08)",
                    }}
                  >
                    {/* Barre d'accent en haut */}
                    <div
                      className="absolute left-0 right-0 top-0 h-1.5 rounded-t-2xl"
                      style={{
                        background: `linear-gradient(90deg, ${theme.colors.secondary}, ${theme.colors.accent})`,
                      }}
                    />

                    <div className="flex items-start justify-between">
                      <div>
                        <h2 className="text-base font-semibold text-gray-900">
                          {a?.nom || "Agence"}
                        </h2>
                        <p className="text-xs text-gray-500">
                          {a?.ville ? a.ville : ""} {a?.pays ? `• ${a.pays}` : ""}
                        </p>
                      </div>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: `${theme.colors.secondary}15`,
                          color: theme.colors.secondary,
                        }}
                      >
                        {billets} billets
                      </span>
                    </div>

                    <div className="mt-4">
                      <div className="text-2xl font-bold">{fmtXOF(ca)}</div>
                      <p className="text-xs text-gray-500">CA sur la période</p>
                    </div>

                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                        <span>Guichet</span>
                        <span>{guichet}/{billets} ({pGuichet}%)</span>
                      </div>
                      <div className="w-full h-2 bg-gray-200/70 rounded-full overflow-hidden">
                        <div
                          className="h-full"
                          style={{
                            width: `${pGuichet}%`,
                            background: `linear-gradient(90deg, ${theme.colors.primary}, ${theme.colors.secondary})`,
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-gray-600 mt-1">
                        <span>En ligne</span>
                        <span>{enLigne}/{billets} ({100 - pGuichet}%)</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Détails agence (agrégés par trajet) */}
            {selectedAgencyId && (
              <div
                className="rounded-2xl border shadow-sm overflow-hidden"
                style={{
                  background: "rgba(255,255,255,0.58)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  borderColor: "rgba(0,0,0,0.08)",
                }}
              >
                <div className="p-6 border-b">
                  <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {findAgencyDisplay(selectedAgencyId)}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {totalsSelected.billets} billets ·{" "}
                        <span className="font-medium">{fmtXOF(totalsSelected.ca)}</span>{" "}
                        · Guichet {totalsSelected.guichet} — En ligne {totalsSelected.enLigne}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={exportAggregatedCSV}
                        className="flex items-center px-3 py-1 rounded-full text-sm border bg-white hover:bg-gray-50"
                      >
                        <FaDownload className="mr-2" />
                        Exporter (agrégé)
                      </button>
                      <button
                        onClick={() => window.print()}
                        className="flex items-center px-3 py-1 rounded-full text-sm"
                        style={{ backgroundColor: theme.colors.primary, color: "#fff" }}
                      >
                        <FaPrint className="mr-2" />
                        Imprimer
                      </button>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-white/60 backdrop-blur">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">
                          Trajet
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wide">
                          Billets
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wide">
                          Guichet
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wide">
                          En ligne
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wide">
                          CA
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wide">
                          Dernière vente
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white/40 backdrop-blur divide-y divide-gray-100">
                      {paginated.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                            Aucune donnée pour cette agence et ces filtres.
                          </td>
                        </tr>
                      ) : (
                        paginated.map((r) => (
                          <tr key={r.trajet} className="hover:bg-white/60">
                            <td className="px-6 py-3 text-sm font-medium text-gray-900">
                              {r.trajet}
                            </td>
                            <td className="px-6 py-3 text-sm text-right">{r.billets}</td>
                            <td className="px-6 py-3 text-sm text-right">{r.guichet}</td>
                            <td className="px-6 py-3 text-sm text-right">{r.enLigne}</td>
                            <td className="px-6 py-3 text-sm text-right">{fmtXOF(r.ca)}</td>
                            <td className="px-6 py-3 text-sm text-right text-gray-600">
                              {r.lastSale ? r.lastSale.toLocaleDateString("fr-FR") : "—"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {aggregatedByTrajet.length > 10 && (
                  <div className="px-6 py-4 border-t flex items-center justify-between bg-white/60 backdrop-blur">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="flex items-center px-3 py-1 border rounded-full text-sm bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                      <FaChevronLeft className="mr-1" />
                      Précédent
                    </button>
                    <span className="text-sm text-gray-700">
                      Page {currentPage} sur {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage((p) => p + 1)}
                      disabled={currentPage === totalPages}
                      className="flex items-center px-3 py-1 border rounded-full text-sm bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                      Suivant
                      <FaChevronRight className="ml-1" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CompagnieReservationsPage;