// ✅ src/pages/ClientMesReservationsPage.tsx
import React, { useMemo, useState } from "react";
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
import { ChevronLeft, Search, Phone, Calendar, MapPin, Users, CreditCard, FileText } from "lucide-react";

dayjs.locale("fr");

export type Reservation = {
  id: string;
  companyId: string;
  agencyId: string;
  companySlug?: string;

  // champs fréquents
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
  (raw || "")
    .replace(/[^\d+]/g, "")
    .replace(/^00/, "+")
    .trim();

const StatusPill: React.FC<{ s?: string }> = ({ s }) => {
  const v = (s || "").toLowerCase();
  const css =
    v.includes("pay") || v.includes("confirm")
      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
      : v.includes("attent")
      ? "bg-amber-100 text-amber-700 border-amber-200"
      : v.includes("annul") || v.includes("refus")
      ? "bg-rose-100 text-rose-700 border-rose-200"
      : "bg-slate-100 text-slate-700 border-slate-200";
  const label =
    v.includes("pay") ? "Payé" :
    v.includes("confirm") ? "Confirmée" :
    v.includes("attent") ? "En attente" :
    v.includes("annul") ? "Annulée" :
    v.includes("refus") ? "Refusée" : (s || "—");

  return (
    <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border ${css}`}>
      {label}
    </span>
  );
};

const ClientMesReservationsPage: React.FC = () => {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();

  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Reservation[]>([]);
  const [error, setError] = useState<string>("");

  const title = useMemo(
    () => (slug ? "Mes réservations" : "Retrouver mes réservations"),
    [slug]
  );

  const fetchForCompanyId = async (companyId: string, companyData: DocumentData) => {
    const agences = await getDocs(collection(db, "companies", companyId, "agences"));
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
      setError("Entrez un numéro de téléphone valide.");
      return;
    }
    setError("");
    setLoading(true);
    setRows([]);

    try {
      let results: Reservation[] = [];

      if (slug) {
        // ——— recherche dans la compagnie courante (par slug)
        const companies = await getDocs(query(collection(db, "companies"), where("slug", "==", slug)));
        if (companies.empty) {
          setError("Compagnie introuvable.");
        } else {
          const cdoc = companies.docs[0];
          results = results.concat(await fetchForCompanyId(cdoc.id, cdoc.data()));
        }
      } else {
        // ——— recherche plateforme : toutes les compagnies
        const companies = await getDocs(collection(db, "companies"));
        for (const c of companies.docs) {
          results = results.concat(await fetchForCompanyId(c.id, c.data()));
        }
      }

      // tri par date/heure décroissante
      results.sort((a, b) => {
        const ta = (toDayjs(a.date)?.valueOf() || 0) + (a.heure ? dayjs(`1970-01-01T${a.heure}`).valueOf() % 86400000 : 0);
        const tb = (toDayjs(b.date)?.valueOf() || 0) + (b.heure ? dayjs(`1970-01-01T${b.heure}`).valueOf() % 86400000 : 0);
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b">
        <div className="max-w-3xl mx-auto px-3 py-2 flex items-center gap-2">
          <button
            onClick={() => (slug ? navigate(`/${slug}`) : navigate("/"))}
            className="p-2 rounded hover:bg-gray-100"
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
          <label className="text-sm text-gray-700">Numéro de téléphone</label>
          <div className="mt-2 flex gap-2">
            <div className="relative flex-1">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+223 70 00 00 00"
                className="w-full h-11 pl-9 pr-3 border rounded-lg"
                onKeyDown={(e) => e.key === "Enter" && search()}
              />
            </div>
            <button
              onClick={search}
              disabled={loading}
              className="h-11 px-4 rounded-lg text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 inline-flex items-center gap-2"
            >
              <Search className="w-4 h-4" />
              Rechercher
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </section>

        {/* Résultats */}
        <section className="bg-white border rounded-xl">
          <div className="p-3 border-b flex items-center gap-2 text-gray-800">
            <FileText className="w-4 h-4 text-orange-600" />
            <span className="text-sm font-medium">Résultats</span>
            <span className="ml-auto text-xs text-gray-500">{rows.length} élément(s)</span>
          </div>

          {loading ? (
            <div className="p-6 text-sm text-gray-600">Chargement…</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">Aucun résultat.</div>
          ) : (
            <ul className="divide-y">
              {rows.map((r) => {
                const dateTxt =
                  toDayjs(r.date)?.format("dddd D MMMM YYYY") || "—";
                const heure = r.heure || "";
                const from = r.depart || "—";
                const to = r.arrivee || r.arrival || "—";
                const places =
                  r.nombre_places ?? r.seatsGo ?? undefined;
                const amount =
                  r.montant_total ?? r.montant ?? undefined;

                return (
                  <li key={`${r.companyId}_${r.agencyId}_${r.id}`} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">
                          {from} → {to}
                        </div>
                        <div className="mt-1 text-xs text-gray-600 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {dateTxt} {heure && `à ${heure}`}
                          </span>
                          {r.lieu_depart && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5" />
                              Départ : {r.lieu_depart}
                            </span>
                          )}
                          {typeof places === "number" && (
                            <span className="inline-flex items-center gap-1">
                              <Users className="w-3.5 h-3.5" />
                              {places} place(s)
                            </span>
                          )}
                          {typeof amount === "number" && (
                            <span className="inline-flex items-center gap-1">
                              <CreditCard className="w-3.5 h-3.5" />
                              {amount.toLocaleString("fr-FR")} FCFA
                            </span>
                          )}
                        </div>
                        <div className="mt-2">
                          <StatusPill s={r.statut} />
                        </div>
                      </div>

                      <div className="shrink-0">
                        <button
                          onClick={() =>
                            navigate(`/${r.companySlug || slug || ""}/reservation/${r.id}`, {
                              state: { companyId: r.companyId, agencyId: r.agencyId },
                            })
                          }
                          className="text-sm px-3 py-1.5 rounded-md border hover:bg-gray-50"
                        >
                          Voir billet
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
};

export default ClientMesReservationsPage;
