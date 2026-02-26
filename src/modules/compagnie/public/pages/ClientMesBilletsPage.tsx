// ✅ ClientMesBilletsPage.tsx — Portefeuille transport (Mon portefeuille)
// 3 sections : À venir | Voyages effectués | Annulés. Un seul badge principal + canal.
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  DocumentData,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import dayjs from "dayjs";
import "dayjs/locale/fr";
import { useNavigate, useParams } from "react-router-dom";
import {
  ChevronLeft,
  Search,
  Phone,
  Wallet,
  ArrowRight,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import {
  shouldShowInWallet,
  getWalletDisplayState,
  getEffectiveStatut,
  type WalletSectionId,
} from "@/utils/reservationStatusUtils";

dayjs.locale("fr");

/* ---------- Pays Afrique de l'Ouest (sélecteur téléphone) ---------- */
const WEST_AFRICA_COUNTRIES = [
  { code: "ML", name: "Mali", dialCode: "+223" },
  { code: "SN", name: "Sénégal", dialCode: "+221" },
  { code: "CI", name: "Côte d'Ivoire", dialCode: "+225" },
  { code: "BF", name: "Burkina Faso", dialCode: "+226" },
  { code: "GN", name: "Guinée", dialCode: "+224" },
  { code: "NE", name: "Niger", dialCode: "+227" },
  { code: "TG", name: "Togo", dialCode: "+228" },
  { code: "BJ", name: "Bénin", dialCode: "+229" },
  { code: "GH", name: "Ghana", dialCode: "+233" },
] as const;

const DEFAULT_COUNTRY_CODE = "ML";

const STORAGE_KEY_PHONE = "mesBillets_lastPhone";
const STORAGE_KEY_COUNTRY = "mesBillets_lastCountry";

/* ---------- Types ---------- */
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
  couleurPrimaire?: string;
  couleurSecondaire?: string;
  canal?: "guichet" | "en_ligne" | string;
};

/* ---------- Helpers ---------- */
const toDayjs = (d: Reservation["date"]) => {
  if (!d) return null;
  if (typeof d === "string") return dayjs(d);
  if (typeof d === "object" && "seconds" in d) return dayjs(d.seconds * 1000);
  return null;
};

/** Formate les chiffres du numéro avec espaces : 78950000 → "78 95 00 00" */
function formatPhoneDisplay(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 10);
  const parts: string[] = [];
  for (let i = 0; i < d.length; i += 2) parts.push(d.slice(i, i + 2));
  return parts.join(" ");
}

/** Depuis digits nationaux + dialCode, retourne E.164 (ex: +22378950000) */
function toE164(dialCode: string, nationalDigits: string): string {
  const digits = nationalDigits.replace(/\D/g, "");
  const code = dialCode.replace(/\D/g, "");
  return `+${code}${digits}`;
}

/** Sections portefeuille : 4 blocs pour éviter surcharge (Annulés / Remboursés regroupés) */
const WALLET_SECTION_TITLES: Record<WalletSectionId, string> = {
  a_venir: "À venir",
  voyages_effectues: "Voyages effectués",
  en_verification: "En vérification",
  annules: "Annulés / Remboursés",
};

/* ---------- Composant ---------- */
const ClientMesBilletsPage: React.FC = () => {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const money = useFormatCurrency();

  const [theme, setTheme] = useState({
    primary: "#ea580c",
    secondary: "#f97316",
  });
  const [companyCountryCode, setCompanyCountryCode] = useState<string | null>(
    null
  );

  const [selectedCountryCode, setSelectedCountryCode] = useState<string>(
    DEFAULT_COUNTRY_CODE
  );
  const [phoneDigits, setPhoneDigits] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Reservation[]>([]);
  const [error, setError] = useState<string>("");
  const [countryOpen, setCountryOpen] = useState(false);

  const title = useMemo(
    () => (slug ? "Mon portefeuille" : "Retrouver mes billets"),
    [slug]
  );

  const selectedCountry = useMemo(
    () =>
      WEST_AFRICA_COUNTRIES.find((c) => c.code === selectedCountryCode) ??
      WEST_AFRICA_COUNTRIES[0],
    [selectedCountryCode]
  );

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
          const cc = (d?.countryCode || d?.pays || "").toString().toUpperCase();
          if (cc) {
            const match = WEST_AFRICA_COUNTRIES.find(
              (x) => x.code === cc || x.name.toUpperCase().startsWith(cc)
            );
            setCompanyCountryCode(match ? match.code : null);
            if (match) setSelectedCountryCode(match.code);
          }
        }
      } catch {
        /* ignore */
      }
    })();
  }, [slug]);

  useEffect(() => {
    if (companyCountryCode && WEST_AFRICA_COUNTRIES.some((c) => c.code === companyCountryCode)) {
      setSelectedCountryCode(companyCountryCode);
    }
  }, [companyCountryCode]);

  /** Pré-remplissage wallet : dernier numéro (et pays si pas de slug) en localStorage */
  useEffect(() => {
    try {
      const p = localStorage.getItem(STORAGE_KEY_PHONE);
      const c = localStorage.getItem(STORAGE_KEY_COUNTRY);
      if (p) setPhoneDigits(p);
      if (!slug && c && WEST_AFRICA_COUNTRIES.some((x) => x.code === c))
        setSelectedCountryCode(c);
    } catch {
      /* ignore */
    }
  }, [slug]);

  /** Construit un doc résa normalisé (dédupliqué par id) */
  const mapDoc = (
    d: QueryDocumentSnapshot,
    companyId: string,
    agencyId: string,
    companyData: DocumentData
  ): Reservation => {
    const r = d.data() as any;
    return {
      id: d.id,
      companyId,
      agencyId,
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
      montant: r.montant,
      statut: r.statut,
      lieu_depart: r.lieu_depart,
      canal: r.canal || undefined,
    };
  };

  /**
   * Double requête pour compatibilité legacy : E.164 + format national.
   * Fusionne et déduplique par id pour ne pas casser l'historique (78950000, 78 95 00 00, +22378950000).
   */
  const fetchForCompanyId = async (
    companyId: string,
    companyData: DocumentData
  ) => {
    const agences = await getDocs(
      collection(db, "companies", companyId, "agences")
    );
    const phoneE164 = toE164(selectedCountry.dialCode, phoneDigits);
    const nationalOnly = phoneDigits.replace(/\D/g, "");
    const seen = new Set<string>();
    const out: Reservation[] = [];

    for (const ag of agences.docs) {
      const base = collection(
        db,
        "companies",
        companyId,
        "agences",
        ag.id,
        "reservations"
      );

      const [snapE164, snapNational] = await Promise.all([
        getDocs(query(base, where("telephone", "==", phoneE164))),
        nationalOnly.length >= 8
          ? getDocs(query(base, where("telephone", "==", nationalOnly)))
          : Promise.resolve({ docs: [] } as unknown as QuerySnapshot),
      ]);

      const addUnique = (d: QueryDocumentSnapshot) => {
        const key = `${companyId}_${ag.id}_${d.id}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(mapDoc(d, companyId, ag.id, companyData));
      };

      snapE164.docs.forEach((d) => addUnique(d));
      snapNational.docs.forEach((d) => addUnique(d));
    }

    return out;
  };

  const search = async () => {
    const digits = phoneDigits.replace(/\D/g, "");
    if (digits.length < 8) {
      setError("Entrez un numéro valide (au moins 8 chiffres).");
      return;
    }
    setError("");
    setLoading(true);
    setRows([]);

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

      results = results.filter((r) => shouldShowInWallet(r.statut));

      if (!results.length)
        setError("Aucun billet trouvé pour ce numéro.");
      setRows(results);
      try {
        localStorage.setItem(STORAGE_KEY_PHONE, phoneDigits);
        localStorage.setItem(STORAGE_KEY_COUNTRY, selectedCountryCode);
      } catch {
        /* ignore */
      }
    } catch (e) {
      console.error(e);
      setError("Erreur lors de la recherche. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  /** Regroupement par section d'affichage (À venir, Voyages effectués, En vérification, Annulés) */
  const sections = useMemo(() => {
    const aVenir: Reservation[] = [];
    const voyagesEffectues: Reservation[] = [];
    const enVerification: Reservation[] = [];
    const annules: Reservation[] = [];

    const sortKey = (r: Reservation) =>
      (toDayjs(r.date)?.valueOf() || 0) +
      (r.heure ? dayjs(`1970-01-01T${r.heure}`).valueOf() % 86400000 : 0);

    rows.forEach((r) => {
      const effective = getEffectiveStatut(r);
      const state = getWalletDisplayState(effective);
      if (!state) return;
      // Section = statut effectif (expire côté UI si date + 30 j dépassée). "Voyages effectués" = embarqué seulement.
      if (state.section === "a_venir") aVenir.push(r);
      else if (state.section === "voyages_effectues") voyagesEffectues.push(r);
      else if (state.section === "en_verification") enVerification.push(r);
      else annules.push(r);
    });

    aVenir.sort((a, b) => sortKey(a) - sortKey(b));
    voyagesEffectues.sort((a, b) => sortKey(b) - sortKey(a));
    enVerification.sort((a, b) => sortKey(a) - sortKey(b));
    annules.sort((a, b) => sortKey(b) - sortKey(a));

    return [
      { id: "a_venir" as const, items: aVenir },
      { id: "voyages_effectues" as const, items: voyagesEffectues },
      { id: "en_verification" as const, items: enVerification },
      { id: "annules" as const, items: annules },
    ];
  }, [rows]);

  const goToReceipt = (r: Reservation) => {
    const slugToUse = r.companySlug || slug || "";
    navigate(`/${slugToUse}/receipt/${r.id}`, {
      state: { companyId: r.companyId, agencyId: r.agencyId },
    });
  };

  const handlePhoneInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, "").slice(0, 10);
    setPhoneDigits(v);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header
        className="sticky top-0 z-20 border-b border-white/10"
        style={{ backgroundColor: theme.primary }}
      >
        <div className="max-w-3xl mx-auto px-3 py-2.5 flex items-center gap-2 text-white">
          <button
            onClick={() => (slug ? navigate(`/${slug}`) : navigate("/"))}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Retour"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="font-semibold text-base">{title}</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-5">
        {/* ---------- Section téléphone PRO ---------- */}
        <section
          className="rounded-2xl border bg-white p-4 shadow-sm"
          style={{ borderColor: `${theme.primary}15` }}
        >
          <label className="block text-sm font-medium text-gray-800">
            Numéro de téléphone
          </label>
          <p className="mt-1 text-xs text-gray-500">
            Saisissez le numéro utilisé pour vos billets (format international).
          </p>
          <div className="mt-3 flex gap-2">
            <div className="flex flex-1 rounded-xl border bg-gray-50/80 overflow-hidden">
              <div className="flex items-center">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setCountryOpen((o) => !o)}
                    className="flex items-center gap-1.5 pl-3 pr-2 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <Phone className="w-4 h-4 text-gray-500" />
                    <span className="tabular-nums">{selectedCountry.dialCode}</span>
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  </button>
                  {countryOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        aria-hidden
                        onClick={() => setCountryOpen(false)}
                      />
                      <div
                        className="absolute left-0 top-full mt-1 z-20 w-56 max-h-64 overflow-auto rounded-xl border bg-white shadow-lg py-1"
                        style={{ borderColor: `${theme.primary}25` }}
                      >
                        {WEST_AFRICA_COUNTRIES.map((c) => (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() => {
                              setSelectedCountryCode(c.code);
                              setCountryOpen(false);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                            style={{
                              backgroundColor:
                                c.code === selectedCountryCode
                                  ? `${theme.primary}10`
                                  : undefined,
                            }}
                          >
                            <span className="tabular-nums text-gray-600 w-12">
                              {c.dialCode}
                            </span>
                            <span className="text-gray-900">{c.name}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div
                  className="w-px h-8"
                  style={{ backgroundColor: `${theme.primary}20` }}
                />
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="78 95 00 00"
                  value={formatPhoneDisplay(phoneDigits)}
                  onChange={handlePhoneInputChange}
                  onKeyDown={(e) => e.key === "Enter" && search()}
                  className="flex-1 min-w-0 py-2.5 px-3 bg-transparent text-gray-900 placeholder-gray-400 text-sm outline-none"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={search}
              disabled={loading}
              className="shrink-0 h-11 px-4 rounded-xl font-medium text-white shadow-sm disabled:opacity-60 inline-flex items-center gap-2 transition-opacity"
              style={{ backgroundColor: theme.primary }}
            >
              <Search className="w-4 h-4" />
              Rechercher
            </button>
          </div>
          {error && (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
        </section>

        {/* ---------- Portefeuille : 3 sections (À venir, Voyages effectués, Annulés) ---------- */}
        <section
          className="rounded-2xl border bg-white overflow-hidden shadow-sm"
          style={{ borderColor: `${theme.primary}15` }}
        >
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4" style={{ color: theme.primary }} />
              <span className="text-sm font-medium text-gray-800">
                Mon portefeuille
              </span>
            </div>
            {rows.length > 0 && (
              <span className="text-xs text-gray-500">
                {rows.length} billet{rows.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {loading ? (
            <div className="p-8 text-sm text-gray-500 text-center">
              Chargement…
            </div>
          ) : sections.every((s) => s.items.length === 0) ? (
            <div className="p-8 text-sm text-gray-500 text-center">
              Aucun billet pour ce numéro.
            </div>
          ) : (
            <div className="p-3 space-y-6">
              {sections.map(
                (sec) =>
                  sec.items.length > 0 && (
                    <div key={sec.id}>
                      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 px-0.5">
                        {WALLET_SECTION_TITLES[sec.id]}
                      </h2>
                      <ul className="space-y-2">
                        {sec.items.map((r) => {
                          const depart =
                            (r.depart ?? "").trim() || "—";
                          const arrivee =
                            (r.arrivee ?? r.arrival ?? "").trim() || "—";
                          const tripDate = toDayjs(r.date);
                          const dateHeure = tripDate
                            ? tripDate.format("ddd D MMM") +
                              (r.heure ? ` • ${r.heure}` : "")
                            : "—";
                          const places =
                            r.nombre_places ?? r.seatsGo ?? undefined;
                          const amount =
                            r.montant_total ?? r.montant ?? undefined;
                          const walletState = getWalletDisplayState(getEffectiveStatut(r));

                          return (
                            <li
                              key={`${r.companyId}_${r.agencyId}_${r.id}`}
                              className="list-none"
                            >
                              <div
                                className="rounded-2xl border bg-white p-3 shadow-sm transition-shadow active:shadow-md min-h-0"
                                style={{
                                  borderColor: `${theme.primary}18`,
                                  borderRadius: "16px",
                                }}
                              >
                                {/* Ligne 1 : Depart → Arrivee  +  Prix */}
                                <div className="flex items-center justify-between gap-2">
                                  <p className="min-w-0 flex-1 text-sm font-semibold text-gray-900 truncate">
                                    <span>{depart}</span>
                                    <ArrowRight
                                      className="inline-block h-3.5 w-3.5 mx-1 shrink-0 align-middle"
                                      style={{ color: theme.primary }}
                                      aria-hidden
                                    />
                                    <span>{arrivee}</span>
                                  </p>
                                  {typeof amount === "number" && (
                                    <span
                                      className="shrink-0 text-sm font-bold tabular-nums"
                                      style={{ color: theme.primary }}
                                    >
                                      {money(amount)}
                                    </span>
                                  )}
                                </div>
                                {/* Ligne 2 : Sam 21 fév • 05:00 */}
                                <p className="mt-1 text-xs text-gray-500">
                                  {dateHeure}
                                </p>
                                {/* Ligne 3 : X places */}
                                {typeof places === "number" && (
                                  <p className="mt-0.5 text-xs text-gray-500">
                                    {places} place{places > 1 ? "s" : ""}
                                  </p>
                                )}
                                {/* Ligne 4 : [ Badge principal ] [ Canal ] + bouton Voir → */}
                                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {walletState && (
                                      <span
                                        className="rounded-full px-2 py-0.5 text-xs font-medium border"
                                        style={
                                          sec.id === "annules"
                                            ? {
                                                backgroundColor: "rgb(254 226 226)",
                                                borderColor: "rgb(252 165 165)",
                                                color: "rgb(153 27 27)",
                                              }
                                            : sec.id === "en_verification"
                                              ? {
                                                  backgroundColor: "rgb(254 243 199)",
                                                  borderColor: "rgb(253 224 71)",
                                                  color: "rgb(113 63 18)",
                                                }
                                              : {
                                                  backgroundColor: "rgb(209 250 229)",
                                                  borderColor: "rgb(134 239 172)",
                                                  color: "rgb(4 120 87)",
                                                }
                                        }
                                      >
                                        {walletState.label}
                                      </span>
                                    )}
                                    {r.canal && (
                                      <span
                                        className="rounded-full border px-2 py-0.5 text-xs font-medium"
                                        style={{
                                          backgroundColor: `${theme.primary}10`,
                                          borderColor: `${theme.primary}25`,
                                          color: theme.primary,
                                        }}
                                      >
                                        {r.canal === "guichet"
                                          ? "Guichet"
                                          : "En ligne"}
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => goToReceipt(r)}
                                    className="shrink-0 inline-flex items-center gap-0.5 rounded-lg py-1 px-2 text-xs font-medium transition-opacity active:opacity-90"
                                    style={{
                                      color: theme.primary,
                                      backgroundColor: `${theme.primary}12`,
                                    }}
                                  >
                                    Voir
                                    <ChevronRight className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default ClientMesBilletsPage;
