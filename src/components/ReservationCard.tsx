// =============================================
// src/components/ReservationCard.tsx
// =============================================
import React from "react";
import { cn } from "@/lib/utils";
import { Loader2, CheckCircle2, XCircle, Trash2, Ticket, Phone, Mail, MapPin, Calendar } from "lucide-react";

/** 
 * Type assoupli pour accepter plusieurs schémas de réservation
 * (legacy + en ligne). On garde seulement `id` obligatoire.
 */
export type ReservationLike = {
  id: string;
  agencyId?: string;

  // Identité client (plusieurs variantes)
  nomClient?: string;
  clientNom?: string;
  prenomClient?: string;
  clientPrenom?: string;

  telephone?: string;
  clientTel?: string;
  email?: string;

  // Trajet / villes
  depart?: string;
  departVille?: string;
  departNom?: string;
  arrivee?: string;
  arriveeVille?: string;
  arriveeNom?: string;

  // Référence / statut / montant
  referenceCode?: string;
  ref?: string;
  statut?: string;
  canal?: string;
  montant?: number;
  price?: number;
  total?: number;

  // Dates
  createdAt?: any;
  dateVoyage?: any;

  // Tolérance champs divers
  [key: string]: any;
};

type Props = {
  reservation: ReservationLike;
  onValider?: () => void;
  onRefuser?: () => void;
  onSupprimer?: () => void;
  isLoading?: boolean;
};

function formatMoneyXOF(n?: number) {
  const v = typeof n === "number" ? n : 0;
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", maximumFractionDigits: 0 }).format(v);
}

function getDateLabel(d: any): string {
  try {
    // Firestore Timestamp ?
    if (d?.toDate) return new Date(d.toDate()).toLocaleString("fr-FR");
    // JS Date
    if (d instanceof Date) return d.toLocaleString("fr-FR");
    // millis
    if (typeof d === "number") return new Date(d).toLocaleString("fr-FR");
    // string ISO
    if (typeof d === "string") return new Date(d).toLocaleString("fr-FR");
  } catch {}
  return "—";
}

export const ReservationCard: React.FC<Props> = ({
  reservation,
  onValider,
  onRefuser,
  onSupprimer,
  isLoading,
}) => {
  // --------- Normalisation d’affichage ----------
  const ref =
    reservation.referenceCode ||
    reservation.ref ||
    `#${reservation.id.slice(0, 6).toUpperCase()}`;

  const nom =
    [reservation.nomClient, reservation.clientNom]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    [reservation.prenomClient, reservation.clientPrenom, reservation.clientNom]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "Client";

  const tel = reservation.telephone || reservation.clientTel || "";
  const mail = reservation.email || "";

  const villeDepart = reservation.depart || reservation.departVille || reservation.departNom || "—";
  const villeArrivee = reservation.arrivee || reservation.arriveeVille || reservation.arriveeNom || "—";

  const statut = (reservation.statut || "").toLowerCase();
  const montant = reservation.montant ?? reservation.total ?? reservation.price ?? 0;

  const createdLabel = getDateLabel(reservation.createdAt);
  const voyageLabel = getDateLabel(reservation.dateVoyage);

  const badgeColor =
    statut === "payé" ? "bg-emerald-100 text-emerald-700" :
    statut === "preuve_recue" ? "bg-amber-100 text-amber-700" :
    statut === "refusé" ? "bg-rose-100 text-rose-700" :
    statut === "annulé" ? "bg-gray-200 text-gray-700" :
    "bg-slate-100 text-slate-700";

  // --------- Rendu ----------
  return (
    <div className="bg-white border rounded-xl shadow-sm hover:shadow-md transition-shadow">
      {/* Bande d’accent */}
      <div className="h-1.5 rounded-t-xl bg-gradient-to-r from-blue-600 to-indigo-600" />

      <div className="p-4 space-y-3">
        {/* Ligne 1 : Référence + Statut */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Ticket className="w-4 h-4 text-slate-500" />
            <span className="font-semibold text-slate-900">{ref}</span>
          </div>
          <span className={cn("px-2 py-0.5 text-xs rounded-full", badgeColor)}>
            {statut || "—"}
          </span>
        </div>

        {/* Client */}
        <div className="space-y-1">
          <div className="text-sm font-medium text-slate-900">{nom}</div>
          <div className="flex items-center gap-4 text-xs text-slate-600">
            {tel && (
              <span className="inline-flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" />
                {tel}
              </span>
            )}
            {mail && (
              <span className="inline-flex items-center gap-1">
                <Mail className="w-3.5 h-3.5" />
                {mail}
              </span>
            )}
          </div>
        </div>

        {/* Trajet */}
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <MapPin className="w-4 h-4 text-slate-500" />
          <span>{villeDepart} → {villeArrivee}</span>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
          <div className="inline-flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            Créée: {createdLabel}
          </div>
          <div className="inline-flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            Voyage: {voyageLabel}
          </div>
        </div>

        {/* Montant */}
        <div className="text-right">
          <div className="text-xs text-slate-500">Montant</div>
          <div className="text-lg font-semibold text-slate-900">
            {formatMoneyXOF(montant)}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1">
          {onRefuser && (
            <button
              onClick={onRefuser}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border hover:bg-rose-50 text-rose-700 border-rose-200 disabled:opacity-60"
              title="Refuser"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
              Refuser
            </button>
          )}
          {onSupprimer && (
            <button
              onClick={onSupprimer}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border hover:bg-slate-50 text-slate-700 border-slate-200 disabled:opacity-60"
              title="Supprimer"
            >
              <Trash2 className="w-4 h-4" />
              Supprimer
            </button>
          )}
          {onValider && (
            <button
              onClick={onValider}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"
              title="Valider"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Valider
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Export nommé (compatible avec `import { ReservationCard } from '...'`)
export { ReservationCard as default };
