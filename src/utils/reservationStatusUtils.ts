/**
 * Utilitaire centralisé : validité billet, accès receipt, filtres liste, portefeuille,
 * machine d'état (Phase B gouvernance).
 * Utilisé par TicketOnline, ReservationDetailsPage, ClientMesBilletsPage, AgenceEmbarquementPage.
 *
 * Phase B — Workflow annulation / remboursement (à envoyer avec chaque transition) :
 * - confirme/paye → annulation_en_attente : annulation: { demandePar, demandeLe, motif, canal }
 * - annulation_en_attente → annule : annulation.valideePar, annulation.valideeLe
 * - annule → rembourse : remboursement: { effectuePar, effectueLe, mode: "especes"|"mobile_money" }, optionnel cashRemisPar, cashRemisLe
 * Pour toute transition : utiliser updateReservationStatut (ou buildStatutTransitionPayload + arrayUnion en transaction)
 * depuis @/modules/agence/services/reservationStatutService. Ne pas faire updateDoc direct sur statut sans auditLog.
 */

const normalizeStatut = (s?: string) =>
  (s ?? "").toString().toLowerCase().trim().replace(/\s+/g, "_");

/**
 * Convention unique sans accent (paye, embarque).
 * À utiliser pour toute comparaison ou logique métier sur reservation.statut.
 * Lecture : accepte payé/embarqué (legacy). Écriture : toujours paye, embarque.
 */
export function canonicalStatut(s?: string): string {
  const n = normalizeStatut(s);
  if (n === "payé") return "paye";
  if (n === "embarqué") return "embarque";
  if (n === "annulé") return "annule";
  if (n === "refusé") return "refuse";
  if (n === "validé") return "confirme";
  return n;
}

/** Valeurs canoniques pour requêtes Firestore (inclut legacy pour lecture rétrocompat). Ne pas écrire "payé"/"embarqué". */
export const RESERVATION_STATUT_QUERY_PAID: readonly string[] = ["confirme", "paye", "payé"];
/** Billets éligibles à l'embarquement (canonical + legacy). */
export const RESERVATION_STATUT_QUERY_BOARDABLE: readonly string[] = ["confirme", "paye", "payé", "embarque", "embarqué"];

/* ---------- Phase B : statuts officiels (Spark, sans Cloud Functions) ---------- */

/** Seuls statuts autorisés en base. Convention sans accent : paye, embarque. */
export type ReservationStatut =
  | "confirme"
  | "paye"
  | "preuve_recue"
  | "annulation_en_attente"
  | "annule"
  | "rembourse"
  | "embarque"
  | "expire";

/** Statuts valides (canonical). Legacy payé/embarqué acceptés en lecture via canonicalStatut. */
const VALID_STATUTS = new Set<string>([
  "confirme",
  "paye",
  "preuve_recue",
  "annulation_en_attente",
  "annule",
  "rembourse",
  "embarque",
  "expire",
  "refuse",
  "verification",
]);

/** Transitions autorisées (old → new). Clés et valeurs en canonique (paye, embarque). */
const TRANSITIONS: Map<string, Set<string>> = new Map([
  ["en_attente_paiement", new Set(["preuve_recue"])],
  ["preuve_recue", new Set(["confirme", "refuse"])],
  ["verification", new Set(["confirme", "refuse"])],
  ["confirme", new Set(["embarque", "annulation_en_attente", "expire"])],
  ["paye", new Set(["embarque", "annulation_en_attente", "expire"])],
  ["annulation_en_attente", new Set(["annule"])],
  ["annule", new Set(["rembourse"])],
]);

/**
 * Vérifie si une transition de statut est autorisée.
 * Utilisé côté client et à refléter dans Firestore Security Rules.
 */
export function isValidTransition(oldStatut?: string, newStatut?: string): boolean {
  const oldS = canonicalStatut(oldStatut);
  const newS = canonicalStatut(newStatut);
  if (!oldS || !newS) return false;
  if (oldS === newS) return true;
  const allowed = TRANSITIONS.get(oldS);
  if (!allowed) return false;
  return allowed.has(newS);
}

/**
 * Nombre de jours après la date de voyage pour considérer le billet expiré (affichage uniquement, pas d'écriture en base).
 */
const EXPIRATION_DAYS = 30;

/** Réservation minimale pour getEffectiveStatut (date + statut) */
export type ReservationForEffective = {
  statut?: string;
  date?: string | { seconds: number; nanoseconds: number };
};

/**
 * Retourne le statut effectif côté UI (canonique : paye, embarque).
 * Si date voyage + 30 jours < aujourd'hui et statut in [confirme, paye] → "expire" (affichage uniquement, pas d'écriture en base).
 * Important : expire affichage ≠ expire en base. En base le billet reste confirme/paye ; dashboard agence, stats et exports
 * peuvent encore le considérer valide. Migration future possible vers écriture "expire" en base.
 */
export function getEffectiveStatut(reservation: ReservationForEffective | null | undefined): string | undefined {
  if (!reservation) return undefined;
  const s = canonicalStatut(reservation.statut);
  if (s !== "confirme" && s !== "paye") return reservation.statut ? canonicalStatut(reservation.statut) : undefined;
  const d = reservation.date;
  if (!d) return s;
  const tripDate =
    typeof d === "string"
      ? new Date(d)
      : typeof d === "object" && d && "seconds" in d
        ? new Date((d as { seconds: number }).seconds * 1000)
        : null;
  if (!tripDate || isNaN(tripDate.getTime())) return s;
  const limit = new Date(tripDate);
  limit.setDate(limit.getDate() + EXPIRATION_DAYS);
  return limit < new Date() ? "expire" : s;
}

/** Statuts pour lesquels le QR est affiché (confirme, paye uniquement ; expire invalide via getEffectiveStatut) */
const TICKET_VALID_FOR_QR = new Set(["confirme", "paye"]);

/** Statuts affichés dans la page "Mes billets" (canonical) */
const BILLET_LIST_STATUSES = new Set(["confirme", "paye", "embarque"]);

/** Statuts permettant d'accéder à la page receipt (sans forcément avoir le QR actif) */
const RECEIPT_ACCESS_EXTRA = new Set(["preuve_recue", "verification"]);

/** Statuts à ne pas afficher dans le portefeuille (Mes Billets) */
const WALLET_HIDDEN = new Set(["en_attente_paiement"]);

/** Sections du portefeuille */
export type WalletSectionId =
  | "a_venir"
  | "voyages_effectues"
  | "en_verification"
  | "annules";

export type WalletDisplayState = {
  label: string;
  section: WalletSectionId;
};

/**
 * Transforme le statut technique (ou effectif) en état d'affichage portefeuille.
 * Un seul badge principal par billet. Canal (Guichet/En ligne) = badge secondaire côté UI.
 * - confirme | paye → "Valide"
 * - embarqué → "Voyage effectué"
 * - annule | refusé → "Annulé"
 * - rembourse → "Remboursé"
 * - expire → "Expiré"
 * - annulation_en_attente → "En attente d'annulation"
 * - preuve_recue → "En vérification"
 * - en_attente_paiement → null (ne pas afficher)
 */
export function getWalletDisplayState(statut?: string): WalletDisplayState | null {
  const s = canonicalStatut(statut);
  if (WALLET_HIDDEN.has(s)) return null;
  if (s === "embarque")
    return { label: "Voyage effectué", section: "voyages_effectues" };
  if (s === "annule" || s === "refuse")
    return { label: "Annulé", section: "annules" };
  if (s === "rembourse")
    return { label: "Remboursé", section: "annules" };
  if (s === "expire")
    return { label: "Expiré", section: "annules" };
  if (s === "annulation_en_attente")
    return { label: "En attente d'annulation", section: "en_verification" };
  if (s === "preuve_recue" || s === "verification")
    return { label: "En vérification", section: "en_verification" };
  if (s === "confirme" || s === "paye")
    return { label: "Valide", section: "a_venir" };
  return null;
}

/**
 * La réservation doit-elle apparaître dans le portefeuille (Mes Billets) ?
 * Exclut uniquement en_attente_paiement.
 */
export function shouldShowInWallet(statut?: string): boolean {
  return getWalletDisplayState(statut) !== null;
}

/**
 * Le billet est-il valide pour afficher le QR (confirme ou paye uniquement) ?
 * Utilisé par TicketOnline. Passer le statut effectif (getEffectiveStatut) pour gérer l'expiration.
 */
export function isTicketValidForQR(statut?: string): boolean {
  return TICKET_VALID_FOR_QR.has(canonicalStatut(statut));
}

/**
 * Le billet peut-il être scanné pour embarquement ? Uniquement confirme ou paye (statut effectif).
 * Refuser : annule, rembourse, expire, embarque (déjà utilisé).
 * Utilisé par AgenceEmbarquementPage avant updateStatut.
 */
export function canEmbarkWithScan(effectiveStatut?: string): boolean {
  const s = canonicalStatut(effectiveStatut);
  return s === "confirme" || s === "paye";
}

/**
 * Le statut doit-il apparaître dans la liste "Mes billets" ?
 * Utilisé par ClientMesBilletsPage pour filtrer les réservations.
 */
export function isBilletValidForList(statut?: string): boolean {
  return BILLET_LIST_STATUSES.has(canonicalStatut(statut));
}

/**
 * Réservation payée au guichet ou confirmée en ligne → billet disponible (redirection auto, QR actif).
 * Utilisé par ReservationDetailsPage pour isTicketAvailable.
 */
export function showTicketDirect(reservation: {
  statut?: string;
  canal?: string;
} | null): boolean {
  if (!reservation) return false;
  const canal = (reservation.canal ?? "").toString().toLowerCase();
  const statut = canonicalStatut(reservation.statut);
  return canal === "guichet" || statut === "confirme";
}

/**
 * L'utilisateur peut-il ouvrir la page receipt (billet ou reçu) ?
 * true si showTicketDirect OU statut preuve_recue / verification.
 * Utilisé par ReservationDetailsPage pour le bouton "Voir mon billet".
 */
export function canViewReceiptPage(reservation: {
  statut?: string;
  canal?: string;
} | null): boolean {
  if (!reservation) return false;
  if (showTicketDirect(reservation)) return true;
  return RECEIPT_ACCESS_EXTRA.has(canonicalStatut(reservation.statut));
}
