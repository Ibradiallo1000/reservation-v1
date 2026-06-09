import React, { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import dayjs from "dayjs";
import "dayjs/locale/fr";
import { useNavigate, useParams } from "react-router-dom";
import { SectionCard } from "@/ui";
import { ArrowRight, ChevronRight, KeyRound, Search, Wallet } from "lucide-react";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import {
  getEffectiveStatut,
  getWalletDisplayState,
  shouldShowInWallet,
  type WalletSectionId,
} from "@/utils/reservationStatusUtils";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { PageLoadingState } from "@/shared/ui/PageStates";
import { getDisplayPhone } from "@/utils/phoneUtils";
import { getPublicPathBase } from "../utils/subdomain";
import ReservationStepHeader from "../components/ReservationStepHeader";
import {
  extractPublicTicketToken,
  readLocalTicketPointers,
  saveLocalTicketPointer,
  type LocalTicketPointer,
} from "../utils/localTicketWallet";

dayjs.locale("fr");

type Reservation = {
  id: string;
  publicToken: string;
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
  canal?: string;
};

const WALLET_SECTION_TITLES: Record<WalletSectionId, string> = {
  a_venir: "À venir",
  voyages_effectues: "Voyages effectués",
  en_verification: "En attente de validation",
  annules: "Annulés / Remboursés",
};

const toDayjs = (date: Reservation["date"]) => {
  if (!date) return null;
  if (typeof date === "string") return dayjs(date);
  return dayjs(date.seconds * 1000);
};

function mapReservation(
  data: Record<string, any>,
  pointer: LocalTicketPointer,
  companyId: string,
  agencyId: string,
  reservationId: string
): Reservation {
  return {
    id: reservationId,
    publicToken: pointer.token,
    companyId,
    agencyId,
    companySlug: String(data.companySlug || data.slug || pointer.companySlug || "") || undefined,
    nomClient: data.nomClient || data.clientNom,
    telephone: getDisplayPhone(data),
    depart: data.depart || data.departure,
    arrivee: data.arrivee || data.arrival,
    arrival: data.arrival,
    date: data.date,
    heure: data.heure,
    nombre_places: data.nombre_places ?? data.seatsGo ?? data.seats,
    seatsGo: data.seatsGo,
    montant_total: data.montant_total ?? data.montant,
    montant: data.montant,
    statut: data.statut ?? data.status,
    canal: data.canal,
  };
}

async function loadTicket(pointer: LocalTicketPointer): Promise<Reservation | null> {
  const publicSnap = await getDoc(doc(db, "publicReservations", pointer.token));
  if (!publicSnap.exists()) return null;

  const publicData = publicSnap.data() as Record<string, any>;
  const companyId = String(publicData.companyId || pointer.companyId || "");
  const agencyId = String(publicData.agencyId || pointer.agencyId || "");
  const reservationId = String(publicData.reservationId || pointer.reservationId || "");
  if (!companyId || !agencyId || !reservationId) return null;

  const nestedSnap = await getDoc(
    doc(db, "companies", companyId, "agences", agencyId, "reservations", reservationId)
  );
  const currentData = nestedSnap.exists()
    ? { ...publicData, ...(nestedSnap.data() as Record<string, any>) }
    : publicData;

  saveLocalTicketPointer({
    token: pointer.token,
    companyId,
    agencyId,
    reservationId,
    companySlug: String(currentData.companySlug || currentData.slug || pointer.companySlug || "") || undefined,
  });
  return mapReservation(currentData, pointer, companyId, agencyId, reservationId);
}

const ClientMesBilletsPage: React.FC = () => {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const money = useFormatCurrency();
  const isOnline = useOnlineStatus();
  const pathBase = getPublicPathBase(slug || "");

  const [theme, setTheme] = useState({ primary: "#ea580c", secondary: "#f97316" });
  const [rows, setRows] = useState<Reservation[]>([]);
  const [manualValue, setManualValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return;
    void (async () => {
      try {
        const companies = await getDocs(query(collection(db, "companies"), where("slug", "==", slug)));
        if (!companies.empty) {
          const data = companies.docs[0].data();
          setTheme({
            primary: String(data.couleurPrimaire || "#ea580c"),
            secondary: String(data.couleurSecondaire || "#f97316"),
          });
        }
      } catch {
        // The wallet remains usable with the default theme.
      }
    })();
  }, [slug]);

  const refreshWallet = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const results = await Promise.allSettled(readLocalTicketPointers().map(loadTicket));
      const tickets = results
        .filter((result): result is PromiseFulfilledResult<Reservation | null> => result.status === "fulfilled")
        .map((result) => result.value)
        .filter((ticket): ticket is Reservation => !!ticket && shouldShowInWallet(ticket.statut));
      setRows(tickets);
    } catch (loadError) {
      console.error("[LOCAL_TICKET_WALLET_LOAD_FAILED]", loadError);
      setError(isOnline ? "Impossible de charger vos billets." : "Connexion indisponible.");
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  useEffect(() => {
    void refreshWallet();
  }, [refreshWallet]);

  const addTicket = async () => {
    const token = extractPublicTicketToken(manualValue);
    if (!token) {
      setError("Saisissez le code privé ou le lien reçu après la réservation.");
      return;
    }
    setAdding(true);
    setError("");
    try {
      const ticket = await loadTicket({ token, savedAt: Date.now() });
      if (!ticket) {
        setError("Billet introuvable. Vérifiez le code ou le lien.");
        return;
      }
      setManualValue("");
      await refreshWallet();
    } catch (addError) {
      console.error("[LOCAL_TICKET_WALLET_ADD_FAILED]", addError);
      setError(isOnline ? "Billet introuvable. Vérifiez le code ou le lien." : "Connexion indisponible.");
    } finally {
      setAdding(false);
    }
  };

  const sections = useMemo(() => {
    const grouped: Record<WalletSectionId, Reservation[]> = {
      a_venir: [],
      voyages_effectues: [],
      en_verification: [],
      annules: [],
    };
    rows.forEach((reservation) => {
      const state = getWalletDisplayState(getEffectiveStatut(reservation));
      if (state) grouped[state.section].push(reservation);
    });
    const sortKey = (reservation: Reservation) => toDayjs(reservation.date)?.valueOf() || 0;
    grouped.a_venir.sort((a, b) => sortKey(a) - sortKey(b));
    grouped.en_verification.sort((a, b) => sortKey(a) - sortKey(b));
    grouped.voyages_effectues.sort((a, b) => sortKey(b) - sortKey(a));
    grouped.annules.sort((a, b) => sortKey(b) - sortKey(a));
    return (Object.keys(grouped) as WalletSectionId[]).map((id) => ({ id, items: grouped[id] }));
  }, [rows]);

  const goToReceipt = (reservation: Reservation) => {
    const base = getPublicPathBase(reservation.companySlug || slug || "");
    navigate(base ? `/${base}/receipt/${reservation.id}` : `/receipt/${reservation.id}`, {
      state: { companyId: reservation.companyId, agencyId: reservation.agencyId },
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <ReservationStepHeader
        onBack={() => navigate(pathBase ? `/${pathBase}` : "/")}
        primaryColor={theme.primary}
        secondaryColor={theme.secondary}
        title="Mes billets"
      />

      <main className="max-w-3xl mx-auto p-4 space-y-5 -mt-2">
        <SectionCard title="Ajouter un billet" icon={KeyRound} className="shadow-md rounded-2xl">
          <p className="text-xs text-gray-500">
            Collez le lien privé reçu après votre réservation, ou saisissez son code privé.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              value={manualValue}
              onChange={(event) => setManualValue(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void addTicket()}
              placeholder="Lien ou code privé"
              className="flex-1 min-w-0 rounded-xl border bg-gray-50 px-3 py-2.5 text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => void addTicket()}
              disabled={adding}
              className="shrink-0 h-11 px-4 rounded-xl font-medium text-white disabled:opacity-60 inline-flex items-center gap-2"
              style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` }}
            >
              <Search className="w-4 h-4" />
              Ajouter
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </SectionCard>

        <SectionCard
          title="Mon portefeuille"
          icon={Wallet}
          right={<span className="text-xs text-gray-500">{rows.length} billet{rows.length !== 1 ? "s" : ""}</span>}
          className="shadow-md rounded-2xl"
          noPad
        >
          {loading ? (
            <PageLoadingState blocks={3} />
          ) : sections.every((section) => section.items.length === 0) ? (
            <div className="p-8 text-center">
              <p className="text-sm text-gray-600">Aucun billet enregistré sur cet appareil.</p>
              <p className="text-xs text-gray-500 mt-2">
                Vos prochains billets seront ajoutés automatiquement. Vous pouvez aussi utiliser leur lien privé.
              </p>
            </div>
          ) : (
            <div className="p-3 space-y-6">
              {sections.map((section) =>
                section.items.length ? (
                  <div key={section.id}>
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 px-0.5">
                      {WALLET_SECTION_TITLES[section.id]}
                    </h2>
                    <ul className="space-y-2">
                      {section.items.map((reservation) => {
                        const depart = reservation.depart?.trim() || "—";
                        const arrivee = (reservation.arrivee || reservation.arrival)?.trim() || "—";
                        const tripDate = toDayjs(reservation.date);
                        const dateTime = tripDate
                          ? `${tripDate.format("ddd D MMM")}${reservation.heure ? ` • ${reservation.heure}` : ""}`
                          : "—";
                        const places = reservation.nombre_places ?? reservation.seatsGo;
                        const amount = reservation.montant_total ?? reservation.montant;
                        const walletState = getWalletDisplayState(getEffectiveStatut(reservation));
                        return (
                          <li key={reservation.publicToken}>
                            <div className="rounded-2xl border bg-white p-3 shadow-sm" style={{ borderColor: `${theme.primary}18` }}>
                              <div className="flex items-center justify-between gap-2">
                                <p className="min-w-0 flex-1 text-sm font-semibold text-gray-900 truncate">
                                  {depart}
                                  <ArrowRight className="inline-block h-3.5 w-3.5 mx-1 align-middle" style={{ color: theme.primary }} />
                                  {arrivee}
                                </p>
                                {typeof amount === "number" && (
                                  <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color: theme.primary }}>
                                    {money(amount)}
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-xs text-gray-500">{dateTime}</p>
                              {typeof places === "number" && <p className="mt-0.5 text-xs text-gray-500">{places} place{places > 1 ? "s" : ""}</p>}
                              <div className="mt-2.5 flex items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {walletState && (
                                    <span className="rounded-full px-2 py-0.5 text-xs font-medium border bg-gray-50">
                                      {walletState.label}
                                    </span>
                                  )}
                                  {reservation.canal && (
                                    <span className="rounded-full border px-2 py-0.5 text-xs font-medium" style={{ color: theme.primary, borderColor: `${theme.primary}25` }}>
                                      {reservation.canal === "guichet" ? "Guichet" : "En ligne"}
                                    </span>
                                  )}
                                </div>
                                <button type="button" onClick={() => goToReceipt(reservation)} className="inline-flex items-center gap-0.5 rounded-lg py-1 px-2 text-xs font-medium" style={{ color: theme.primary, backgroundColor: `${theme.primary}12` }}>
                                  Voir <ChevronRight className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null
              )}
            </div>
          )}
        </SectionCard>
      </main>
    </div>
  );
};

export default ClientMesBilletsPage;
