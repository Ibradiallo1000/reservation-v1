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
};

const toDayjs = (d: Reservation["date"]) => {
  if (!d) return null;
  if (typeof d === "string") return dayjs(d);
  if (typeof d === "object" && "seconds" in d) return dayjs(d.seconds * 1000);
  return null;
};

const normalizePhone = (raw: string) =>
  (raw || "").replace(/[^\d+]/g, "").replace(/^00/, "+").trim();

const StatusPill: React.FC<{ s?: string }> = ({ s }) => {
  const v = (s || "").toLowerCase();
  const css =
    v.includes("pay") || v.includes("confirm")
      ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
      : v.includes("attent")
      ? "bg-amber-100 text-amber-700 border border-amber-200"
      : v.includes("annul") || v.includes("refus")
      ? "bg-rose-100 text-rose-700 border border-rose-200"
      : "bg-slate-100 text-slate-700 border border-slate-200";
  const label =
    v.includes("pay")
      ? "Payé"
      : v.includes("confirm")
      ? "Confirmée"
      : v.includes("attent")
      ? "En attente"
      : v.includes("annul")
      ? "Annulée"
      : v.includes("refus")
      ? "Refusée"
      : s || "—";

  return (
    <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full ${css}`}>
      {label}
    </span>
  );
};

const INITIAL_COUNT = 5;
const LOAD_MORE_STEP = 5;

const ClientMesReservationsPage: React.FC = () => {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();

  // 🎨 Thème (par défaut, puis surcharge si slug trouvé)
  const [theme, setTheme] = useState({
    primary: "#ea580c",
    secondary: "#f97316",
  });

  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Reservation[]>([]);
  const [error, setError] = useState<string>("");
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT);

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
    companyData: DocumentData
  ) => {
    const agences = await getDocs(
      collection(db, "companies", companyId, "agences")
    );
    const out: Reservation[] = [];

    for (const ag of agences.docs) {
      const qRef = query(
        collection(db, "companies", companyId, "agences", ag.id, "reservations"),
        where("telephone", "==", phone)
      );
      const snap = await getDocs(qRef);
      snap.forEach((d) => {
        const r = d.data() as any;
        out.push({
          id: d.id,
          companyId,
          agencyId: ag.id,
          companySlug: companyData?.slug || undefined,
          couleurPrimaire: companyData?.couleurPrimaire,
          couleurSecondaire: companyData?.couleurSecondaire,

          nomClient: r.nomClient || r.clientNom,
          telephone: r.telephone,
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
        });
      });
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
    // on normalise la variable utilisée dans les requêtes Firestore
    // (la donnée en base est déjà stockée telle quelle; si tu veux forcer la normalisation,
    // fais-le côté écriture)
    setError("");
    setLoading(true);
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
          const d = cdoc.data() as any;
          setTheme((t) => ({
            ...t,
            primary: d?.couleurPrimaire || t.primary,
            secondary: d?.couleurSecondaire || t.secondary,
          }));
          results = results.concat(await fetchForCompanyId(cdoc.id, d));
        }
      } else {
        const companies = await getDocs(collection(db, "companies"));
        for (const c of companies.docs) {
          results = results.concat(await fetchForCompanyId(c.id, c.data()));
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
      setError("Erreur lors de la recherche. Réessayez.");
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
        {/* Formulaire téléphone */}
        <section className="bg-white border rounded-xl p-4">
          <label className="text-sm font-medium text-gray-800">
            Numéro de téléphone
          </label>
          <p className="mt-1 text-xs text-gray-500">
            Saisissez le numéro utilisé lors de vos réservations puis appuyez sur{" "}
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
                className="w-full h-11 pl-9 pr-3 border rounded-lg focus:ring-2 focus:ring-orange-200 outline-none"
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
        </section>

        {/* Résultats */}
        <section className="bg-white border rounded-xl overflow-hidden">
          <div className="p-3 border-b flex items-center gap-2 text-gray-800">
            <FileText className="w-4 h-4" style={{ color: theme.primary }} />
            <span className="text-sm font-medium">Résultats</span>
            <span className="ml-auto text-xs text-gray-500">
              {rows.length} élément(s)
            </span>
          </div>

          {loading ? (
            <div className="p-6 text-sm text-gray-600">Chargement…</div>
          ) : displayed.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">Aucun résultat.</div>
          ) : (
            <>
              <ul>
                {displayed.map((r) => {
                  const dateTxt = toDayjs(r.date)?.format("dddd D MMMM YYYY") || "—";
                  const heure = r.heure || "";
                  const from = r.depart || "—";
                  const to = r.arrivee || r.arrival || "—";
                  const places = r.nombre_places ?? r.seatsGo ?? undefined;
                  const amount = r.montant_total ?? r.montant ?? undefined;

                  const isPaid = /pay|confirm/i.test(String(r.statut || ""));

                  return (
                    <li key={`${r.companyId}_${r.agencyId}_${r.id}`} className="relative">
                      <div
                        className="m-3 rounded-2xl border bg-white shadow-sm hover:shadow-md transition-all overflow-hidden"
                        style={{ borderColor: `${theme.primary}30` }}
                      >
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
                                <span
                                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border"
                                  style={{ backgroundColor: `${theme.secondary}15`, borderColor: `${theme.secondary}30`, color: "#374151" }}
                                >
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
                                  <span
                                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border"
                                    style={{ backgroundColor: `${theme.primary}12`, borderColor: `${theme.primary}30`, color: "#374151" }}
                                  >
                                    <CreditCard className="w-3.5 h-3.5" />
                                    {amount.toLocaleString("fr-FR")} FCFA
                                  </span>
                                )}
                              </div>

                              <div className="mt-3">
                                <StatusPill s={r.statut} />
                              </div>
                            </div>

                            {/* 🚀 Redirection conditionnelle */}
                            <div className="shrink-0">
                              <button
                                onClick={() => {
                                  const baseSlug = r.companySlug || slug || "";
                                  if (isPaid) {
                                    // Reçu direct
                                    navigate(`/${baseSlug}/receipt/${r.id}`, {
                                      state: { reservation: r },
                                    });
                                  } else {
                                    // Détails (suivi paiement)
                                    navigate(`/${baseSlug}/reservation/${r.id}`, {
                                      state: { companyId: r.companyId, agencyId: r.agencyId },
                                    });
                                  }
                                }}
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
                      setVisibleCount((c) => Math.min(c + LOAD_MORE_STEP, rows.length))
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
        </section>
      </main>
    </div>
  );
};

export default ClientMesReservationsPage;
