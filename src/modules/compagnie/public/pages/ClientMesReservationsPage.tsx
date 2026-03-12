// ✅ src/pages/ClientMesReservationsPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  DocumentData,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import dayjs from "dayjs";
import "dayjs/locale/fr";
import { useNavigate, useParams } from "react-router-dom";
import { SectionCard, StatusBadge } from "@/ui";
import type { StatusVariant } from "@/ui";
import {
  ChevronLeft,
  Search,
  Phone,
  Calendar,
  MapPin,
  Users,
  CreditCard,
  FileText,
} from "lucide-react";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { PageLoadingState } from "@/shared/ui/PageStates";
import { normalizePhone, getDisplayPhone } from "@/utils/phoneUtils";

dayjs.locale("fr");

export type Reservation = {
  id: string;
  companyId: string;
  agencyId: string;
  companySlug?: string;

  nomClient?: string;
  telephone?: string;

  depart?: string;
  arrival?: string;
  arrivee?: string;

  date?: string | { seconds: number; nanoseconds: number };
  heure?: string;

  nombre_places?: number;
  seatsGo?: number;
  montant_total?: number;
  montant?: number;

  statut?: string;
  lieu_depart?: string;

  // couleurs vitrine (optionnel)
  couleurPrimaire?: string;
  couleurSecondaire?: string;

  // 👇 NEW: pour badge canal
  canal?: "guichet" | "en_ligne" | string;
};

const toDayjs = (d: Reservation["date"]) => {
  if (!d) return null;
  if (typeof d === "string") return dayjs(d);
  if (typeof d === "object" && "seconds" in d) return dayjs(d.seconds * 1000);
  return null;
};

function statusToVariant(s?: string): StatusVariant {
  const v = (s || "").toLowerCase();
  if (v.includes("pay") || v.includes("confirm")) return "success";
  if (v.includes("attent")) return "pending";
  if (v.includes("annul") || v.includes("refus")) return "cancelled";
  return "neutral";
}

const StatusPill: React.FC<{ s?: string }> = ({ s }) => {
  const v = (s || "").toLowerCase();
  const label =
    v.includes("pay") ? "Payé"
    : v.includes("confirm") ? "Confirmée"
    : v.includes("attent") ? "En attente"
    : v.includes("annul") ? "Annulée"
    : v.includes("refus") ? "Refusée"
    : s || "—";
  return <StatusBadge status={statusToVariant(s)}>{label}</StatusBadge>;
};

const INITIAL_COUNT = 5;
const LOAD_MORE_STEP = 5;

const ClientMesReservationsPage: React.FC = () => {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const money = useFormatCurrency();

  // 🎨 Thème (par défaut, puis surcharge si slug trouvé)
  const [theme, setTheme] = useState({
    primary: "#ea580c",   // orange-600
    secondary: "#f97316", // orange-500
  });

  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Reservation[]>([]);
  const [error, setError] = useState<string>("");
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT);
  const [hasSearched, setHasSearched] = useState(false);
  const isOnline = useOnlineStatus();

  const title = useMemo(
    () => (slug ? "Mes réservations" : "Retrouver mes réservations"),
    [slug]
  );

  // 🔎 si on a un slug, on charge les couleurs de la compagnie pour le header
  useEffect(() => {
    (async () => {
      if (!slug) return;
      try {
        const c = await getDocs(
          query(collection(db, "companies"), where("slug", "==", slug))
        );
        if (!c.empty) {
          const d = c.docs[0].data() as any;
          setTheme((t) => ({
            ...t,
            primary: d?.couleurPrimaire || t.primary,
            secondary: d?.couleurSecondaire || t.secondary,
          }));
        }
      } catch {
        /* ignore */
      }
    })();
  }, [slug]);

  const fetchForCompanyId = async (
    companyId: string,
    companyData: DocumentData,
    phoneNorm: string
  ) => {
    const agences = await getDocs(
      collection(db, "companies", companyId, "agences")
    );
    const out: Reservation[] = [];
    const seenIds = new Set<string>();

    for (const ag of agences.docs) {
      const colRef = collection(db, "companies", companyId, "agences", ag.id, "reservations");
      const addDoc = (d: { id: string; data: () => any }) => {
        if (seenIds.has(d.id)) return;
        seenIds.add(d.id);
        const r = d.data();
        out.push({
          id: d.id,
          companyId,
          agencyId: ag.id,
          companySlug: companyData?.slug || undefined,
          couleurPrimaire: companyData?.couleurPrimaire,
          couleurSecondaire: companyData?.couleurSecondaire,

          nomClient: r.nomClient || r.clientNom,
          telephone: getDisplayPhone(r),
          depart: r.depart || r.departure,
          arrivee: r.arrivee || r.arrival,
          arrival: r.arrival,

          date: r.date,
          heure: r.heure,

          nombre_places: r.nombre_places ?? r.seatsGo ?? r.seats ?? undefined,
          seatsGo: r.seatsGo,
          montant_total: r.montant_total ?? r.montant ?? undefined,

          statut: r.statut,
          lieu_depart: r.lieu_depart,

          canal: r.canal || undefined,
        });
      };
      const snapNorm = await getDocs(query(colRef, where("telephoneNormalized", "==", phoneNorm)));
      snapNorm.docs.forEach((d) => addDoc(d));
      const snapLegacy = await getDocs(query(colRef, where("telephone", "==", phoneNorm)));
      snapLegacy.docs.forEach((d) => addDoc(d));
    }
    return out;
  };

  const search = async () => {
    const phoneN = normalizePhone(phone);
    if (!phoneN) {
      setError(
        "Entrez le numéro utilisé lors de vos réservations (format local ou international)."
      );
      return;
    }
    // On garde exactement le numéro saisi (pas de normalisation stricte en DB ici)
    // car tes réservations sont déjà enregistrées en format cohérent côté guichet/en ligne.
    setError("");
    setLoading(true);
    setHasSearched(true);
    setRows([]);
    setVisibleCount(INITIAL_COUNT);

    try {
      let results: Reservation[] = [];

      if (slug) {
        const companies = await getDocs(
          query(collection(db, "companies"), where("slug", "==", slug))
        );
        if (companies.empty) {
          setError("Compagnie introuvable.");
        } else {
          const cdoc = companies.docs[0];
          // s’assure que le thème correspond à la compagnie
          const d = cdoc.data() as any;
          setTheme((t) => ({
            ...t,
            primary: d?.couleurPrimaire || t.primary,
            secondary: d?.couleurSecondaire || t.secondary,
          }));
          results = results.concat(await fetchForCompanyId(cdoc.id, d, phoneN));
        }
      } else {
        const companies = await getDocs(collection(db, "companies"));
        for (const c of companies.docs) {
          results = results.concat(await fetchForCompanyId(c.id, c.data(), phoneN));
        }
      }

      // tri par date/heure décroissante
      results.sort((a, b) => {
        const ta =
          (toDayjs(a.date)?.valueOf() || 0) +
          (a.heure ? dayjs(`1970-01-01T${a.heure}`).valueOf() % 86400000 : 0);
        const tb =
          (toDayjs(b.date)?.valueOf() || 0) +
          (b.heure ? dayjs(`1970-01-01T${b.heure}`).valueOf() % 86400000 : 0);
        return tb - ta;
      });

      if (!results.length) setError("Aucune réservation trouvée pour ce numéro.");
      setRows(results);
    } catch (e) {
      console.error(e);
      setError(
        !isOnline
          ? "Connexion indisponible. Impossible de rechercher vos réservations."
          : "Erreur lors de la recherche. Réessayez."
      );
    } finally {
      setLoading(false);
    }
  };

  const displayed = rows.slice(0, visibleCount);
  const canLoadMore = visibleCount < rows.length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header sur couleur primaire */}
      <header
        className="sticky top-0 z-20 border-b"
        style={{ backgroundColor: theme.primary }}
      >
        <div className="max-w-3xl mx-auto px-3 py-2 flex items-center gap-2 text-white">
          <button
            onClick={() => (slug ? navigate(`/${slug}`) : navigate("/"))}
            className="p-2 rounded hover:bg-white/10"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="font-semibold">{title}</h1>
        </div>
      </header>

      {/* Body */}
      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <SectionCard title="Recherche par téléphone" icon={Phone} className="shadow-md">
          <label className="text-sm font-medium text-gray-800">
            Numéro de téléphone
          </label>
          <p className="mt-1 text-xs text-gray-500">
            Saisissez le numéro utilisé lors de vos réservations
            format local, puis appuyez sur{" "}
            <span className="font-medium">Rechercher</span>.
          </p>
          <div className="mt-3 flex gap-2">
            <div className="relative flex-1">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="70 00 00 00"
                className="w-full h-11 pl-9 pr-3 border rounded-lg focus:ring-2 focus:ring-orange-200 outline-none bg-white text-gray-900 placeholder-gray-500"
                onKeyDown={(e) => e.key === "Enter" && search()}
              />
            </div>
            <button
              onClick={search}
              disabled={loading}
              className="h-11 px-4 rounded-lg text-white shadow-sm disabled:opacity-60 inline-flex items-center gap-2"
              style={{ background: `linear-gradient(135deg, ${theme.secondary}, ${theme.primary})` }}
            >
              <Search className="w-4 h-4" />
              Rechercher
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </SectionCard>

        <SectionCard
          title="Résultats"
          icon={FileText}
          right={rows.length > 0 ? <span className="text-xs text-gray-500">{rows.length} élément(s)</span> : undefined}
          className="shadow-md"
          noPad
        >

          {loading ? (
            <PageLoadingState blocks={3} />
          ) : !hasSearched ? (
            <div className="p-6 text-center">
              <p className="text-sm text-gray-600">Entrez le numéro utilisé lors de vos réservations pour les afficher ici.</p>
              <p className="text-xs text-gray-500 mt-2">Vous pouvez aussi rechercher un trajet depuis la page d'accueil de la compagnie.</p>
            </div>
          ) : displayed.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-gray-600">
                {isOnline ? "Aucune réservation trouvée pour ce numéro." : "Hors ligne: impossible de charger les réservations."}
              </p>
              <p className="text-xs text-gray-500 mt-2">Vérifiez le numéro ou réservez un trajet depuis la page d'accueil.</p>
              <div className="mt-4">
                <button
                  onClick={search}
                  className="text-sm px-4 py-2 rounded-lg border hover:bg-gray-50 font-medium"
                  style={{ borderColor: `${theme.primary}40` }}
                >
                  Réessayer
                </button>
              </div>
            </div>
          ) : (
            <>
              <ul className="">
                {displayed.map((r) => {
                  const dateTxt =
                    toDayjs(r.date)?.format("dddd D MMMM YYYY") || "—";
                  const heure = r.heure || "";
                  const from = r.depart || "—";
                  const to = r.arrivee || r.arrival || "—";
                  const places = r.nombre_places ?? r.seatsGo ?? undefined;
                  const amount = r.montant_total ?? r.montant ?? undefined;

                  return (
                    <li
                      key={`${r.companyId}_${r.agencyId}_${r.id}`}
                      className="relative"
                    >
                      {/* Carte stylée */}
                      <div
                        className="m-3 rounded-2xl border bg-white shadow-sm hover:shadow-md transition-all overflow-hidden"
                        style={{ borderColor: `${theme.primary}30` }}
                      >
                        {/* Bande colorée à gauche */}
                        <span
                          className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl"
                          style={{ backgroundColor: theme.primary }}
                        />
                        <div className="p-4 pl-5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-gray-900 truncate">
                                {from} <span className="text-gray-400">→</span> {to}
                              </div>

                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border"
                                      style={{ backgroundColor: `${theme.secondary}15`, borderColor: `${theme.secondary}30`, color: "#374151" }}>
                                  <Calendar className="w-3.5 h-3.5" />
                                  {dateTxt} {heure && `· ${heure}`}
                                </span>

                                {r.lieu_depart && (
                                  <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border text-gray-700 bg-gray-50">
                                    <MapPin className="w-3.5 h-3.5 text-gray-500" />
                                    Départ : {r.lieu_depart}
                                  </span>
                                )}

                                {typeof places === "number" && (
                                  <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border text-gray-700 bg-gray-50">
                                    <Users className="w-3.5 h-3.5 text-gray-500" />
                                    {places} place(s)
                                  </span>
                                )}

                                {typeof amount === "number" && (
                                  <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border"
                                        style={{ backgroundColor: `${theme.primary}12`, borderColor: `${theme.primary}30`, color: "#374151" }}>
                                    <CreditCard className="w-3.5 h-3.5" />
                                    {money(amount)}
                                  </span>
                                )}
                              </div>

                              {/* 👇 NEW: statut + badge canal */}
                              <div className="mt-3 flex items-center gap-2">
                                <StatusPill s={r.statut} />
                                {r.canal && (
                                  <StatusBadge status="neutral">{r.canal === "guichet" ? "Guichet" : "En ligne"}</StatusBadge>
                                )}
                              </div>
                            </div>

                            <div className="shrink-0">
                              <button
                                onClick={() =>
                                  navigate(
                                    `/${r.companySlug || slug || ""}/reservation/${r.id}`,
                                    {
                                      state: {
                                        companyId: r.companyId,
                                        agencyId: r.agencyId,
                                      },
                                    }
                                  )
                                }
                                className="text-sm px-3 py-1.5 rounded-lg border shadow-sm hover:bg-gray-50"
                                style={{ borderColor: `${theme.primary}40` }}
                              >
                                Voir billet
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {canLoadMore && (
                <div className="p-4 border-t flex justify-center">
                  <button
                    onClick={() =>
                      setVisibleCount((c) =>
                        Math.min(c + LOAD_MORE_STEP, rows.length)
                      )
                    }
                    className="text-sm px-4 py-2 rounded-lg border hover:bg-gray-50"
                    style={{ borderColor: `${theme.primary}40` }}
                  >
                    Voir plus
                  </button>
                </div>
              )}
            </>
          )}
        </SectionCard>
      </main>
    </div>
  );
};

export default ClientMesReservationsPage;
