// =============================================
// src/components/ReservationCard.tsx
// =============================================
import React from "react";
import { cn } from "@/lib/utils";
import {
  Loader2, CheckCircle2, XCircle, Trash2, Ticket, Phone, Mail,
  MapPin, Calendar, FileText, ExternalLink
} from "lucide-react";

/** Type assoupli (legacy + en ligne) */
export type ReservationLike = {
  id: string;
  agencyId?: string;

  nomClient?: string;
  clientNom?: string;
  prenomClient?: string;
  clientPrenom?: string;

  telephone?: string;
  clientTel?: string;
  email?: string;

  depart?: string;
  departVille?: string;
  departNom?: string;
  arrivee?: string;
  arriveeVille?: string;
  arriveeNom?: string;

  referenceCode?: string;
  ref?: string;
  statut?: string;
  canal?: string;
  montant?: number;
  price?: number;
  total?: number;

  createdAt?: any;
  dateVoyage?: any;

  // variantes preuve possibles
  preuveUrl?: string | null;
  preuveMessage?: string | null;
  preuveVia?: string | null;
  preuve?: { url?: string | null; message?: string | null; via?: string | null };

  paymentHint?: string | null; // ex: via Orange/Moov…

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
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "XOF",
    maximumFractionDigits: 0
  }).format(v);
}

function getDateLabel(d: any): string {
  try {
    if (d?.toDate) return new Date(d.toDate()).toLocaleString("fr-FR");
    if (d instanceof Date) return d.toLocaleString("fr-FR");
    if (typeof d === "number") return new Date(d).toLocaleString("fr-FR");
    if (typeof d === "string") return new Date(d).toLocaleString("fr-FR");
  } catch {}
  return "—";
}

// label + couleurs du chip
function chipFor(statutRaw: string) {
  const s = (statutRaw || "").toLowerCase();
  if (s === "payé" || s === "paye" || s === "payé") {
    return { label: "Payé", cls: "bg-emerald-100 text-emerald-700 border-emerald-300" };
  }
  if (s === "preuve_recue" || s === "preuve reçue") {
    return { label: "Preuve reçue", cls: "bg-amber-100 text-amber-700 border-amber-300" };
  }
  if (s === "refusé" || s === "refuse") {
    return { label: "Refusé", cls: "bg-rose-100 text-rose-700 border-rose-300" };
  }
  if (s === "annulé" || s === "annule") {
    return { label: "Annulé", cls: "bg-gray-200 text-gray-700 border-gray-300" };
  }
  return { label: statutRaw || "—", cls: "bg-slate-100 text-slate-700 border-slate-300" };
}

const isImage = (url?: string | null) =>
  !!url && /\.(png|jpe?g|webp|gif)$/i.test(url || "");

export const ReservationCard: React.FC<Props> = ({
  reservation,
  onValider,
  onRefuser,
  onSupprimer,
  isLoading,
}) => {
  // ---------- Normalisation d’affichage ----------
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

  const villeDepart =
    reservation.depart || reservation.departVille || reservation.departNom || "—";
  const villeArrivee =
    reservation.arrivee || reservation.arriveeVille || reservation.arriveeNom || "—";

  const statutRaw = reservation.statut || "";
  const chip = chipFor(statutRaw);

  const montant = reservation.montant ?? reservation.total ?? reservation.price ?? 0;

  const createdLabel = getDateLabel(reservation.createdAt);
  const voyageLabel = getDateLabel(reservation.dateVoyage);

  // ---------- Preuve (compat : plat ou objet) ----------
  const proofUrl =
    reservation.preuve?.url ??
    reservation.preuveUrl ??
    null;

  const proofMessage =
    reservation.preuve?.message ??
    reservation.preuveMessage ??
    "";

  const proofVia =
    reservation.preuve?.via ??
    reservation.preuveVia ??
    reservation.paymentHint ??
    "";

  // ---------- Rendu ----------
  return (
    <div className="bg-white border rounded-xl shadow-sm hover:shadow-md transition-shadow">
      {/* Bande d’accent */}
      <div className="h-1.5 rounded-t-xl bg-gradient-to-r from-blue-600 to-indigo-600" />

      <div className="p-4 space-y-3">
        {/* Ligne 1 : Référence + Statut (unique) */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Ticket className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="font-semibold text-slate-900 truncate">{ref}</span>
          </div>
          <span className={cn("px-2 py-0.5 text-xs rounded-full border", chip.cls)}>
            {chip.label}
          </span>
        </div>

        {/* Client */}
        <div className="space-y-1">
          <div className="text-sm font-medium text-slate-900 truncate">{nom}</div>
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
          <span className="truncate">{villeDepart} → {villeArrivee}</span>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
          <div className="inline-flex items-center gap-1 min-w-0">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Créée: {createdLabel}</span>
          </div>
          <div className="inline-flex items-center gap-1 min-w-0">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Voyage: {voyageLabel}</span>
          </div>
        </div>

        {/* Montant */}
        <div className="text-right">
          <div className="text-xs text-slate-500">Montant</div>
          <div className="text-lg font-semibold text-slate-900">
            {formatMoneyXOF(montant)}
          </div>
        </div>

        {/* ✅ Bloc Preuve de paiement (si présent) */}
        {(proofUrl || proofMessage) && (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
            <div className="text-xs font-semibold text-amber-700 mb-1">
              Preuve de paiement
              {proofVia ? ` · ${String(proofVia).replace(/_/g, " ")}` : ""}
            </div>

            {proofMessage && (
              <p className="text-xs text-gray-800 mb-2 break-words">
                {proofMessage}
              </p>
            )}

            {proofUrl && (
              <div className="flex items-center gap-3">
                {isImage(proofUrl) ? (
                  <a
                    href={proofUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                    title="Ouvrir la preuve"
                  >
                    <img
                      src={proofUrl}
                      alt="Preuve de paiement"
                      className="h-20 w-20 object-cover rounded border"
                    />
                  </a>
                ) : (
                  <a
                    href={proofUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-xs px-2 py-1.5 rounded border border-gray-300 hover:bg-gray-50"
                  >
                    <FileText className="w-4 h-4" />
                    Voir la preuve (document)
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            )}
          </div>
        )}

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
