import React, { useRef } from "react";
import QRCode from "react-qr-code";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import html2pdf from "html2pdf.js";
import { DEFAULT_TICKET_MESSAGES } from "@/constants/ticketMessages";
import {
  SALE_ERROR_UI_STATUT,
  SALE_PENDING_UI_STATUT,
  SALE_SLOW_UI_STATUT,
} from "@/modules/agence/guichet/components/pos/RecentSales";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";

export interface ReservationData {
  id: string;
  nomClient: string;
  telephone: string;
  date: string;
  heure: string;
  depart: string;
  arrivee: string;
  seatsGo: number;
  seatsReturn?: number;
  montant: number;
  paiement?: string;
  statut?: string;
  referenceCode?: string;
  agencyNom?: string;
  agenceTelephone?: string;
  createdAt?: unknown;
  compagnieId?: string | null;
  agencyId?: string | null;
  companySlug?: string | null;
  guichetierId?: string | null;
  guichetierCode?: string | null;
  shiftId?: string | null;
  email?: string | null;
}

export interface CompanyData {
  nom: string;
  logoUrl?: string;
  telephone?: string;
  couleurPrimaire?: string;
  couleurSecondaire?: string;
  slug?: string;
  id?: string;
}

type Props = {
  open: boolean;
  onClose: () => void;
  reservation: ReservationData;
  company: CompanyData;
};

function formatFullName(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "number" || typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }
  if (
    typeof value === "object" &&
    value != null &&
    "seconds" in (value as Record<string, unknown>)
  ) {
    const seconds = Number((value as { seconds?: unknown }).seconds ?? 0);
    if (Number.isFinite(seconds) && seconds > 0) {
      return new Date(seconds * 1000);
    }
  }
  return new Date();
}

function formatTripDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return format(d, "dd/MM/yyyy", { locale: fr });
}

function countPlaces(seatsGo: number, seatsReturn?: number): number {
  return Math.max(0, Number(seatsGo ?? 0) + Number(seatsReturn ?? 0));
}

function normalizePaymentLabel(value: string | null | undefined): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "Especes";
  if (raw === "especes" || raw === "espèces" || raw === "cash") return "Especes";
  if (raw.includes("mobile")) return "Mobile money";
  if (raw.includes("carte")) return "Carte";
  if (raw.includes("virement")) return "Virement";
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const separatorStyle: React.CSSProperties = {
  border: 0,
  borderTop: "1px solid #d1d5db",
  margin: "6px 0",
};

const ReceiptModal: React.FC<Props> = ({ open, onClose, reservation, company }) => {
  const money = useFormatCurrency();
  const ref = useRef<HTMLDivElement>(null);
  if (!open) return null;

  const receiptNumber = reservation.referenceCode || reservation.id;
  const qrValue = `${window.location.origin}/r/${encodeURIComponent(receiptNumber)}`;
  const emissionDate = format(toDate(reservation.createdAt), "dd/MM/yyyy HH:mm", { locale: fr });
  const agencyLabel = reservation.agencyNom || "Agence";
  const passengerName = formatFullName(reservation.nomClient) || "-";
  const paymentLabel = normalizePaymentLabel(reservation.paiement);
  const placesCount = countPlaces(reservation.seatsGo, reservation.seatsReturn);
  const destinationLabel = `${String(reservation.depart || "-").toUpperCase()} -> ${String(reservation.arrivee || "-").toUpperCase()}`;
  const departureLabel = `${formatTripDate(reservation.date)} a ${reservation.heure || "--:--"}`;
  const serviceLabel = "Billetterie";
  const agentCode = String(reservation.guichetierCode ?? "").trim().toUpperCase();
  const showAgentLine =
    agentCode.length > 0 && !String(receiptNumber).toUpperCase().includes(agentCode);

  const isPendingEncaissement = reservation.statut === SALE_PENDING_UI_STATUT;
  const isErrorEncaissement = reservation.statut === SALE_ERROR_UI_STATUT;
  const blockFinalTicket =
    isPendingEncaissement ||
    reservation.statut === SALE_SLOW_UI_STATUT ||
    isErrorEncaissement;

  const handlePDF = () => {
    if (!ref.current || blockFinalTicket) return;
    html2pdf()
      .set({
        margin: 2,
        filename: `ticket-${receiptNumber}.pdf`,
        html2canvas: { scale: 2 },
        jsPDF: { unit: "mm", format: [80, 200] },
      })
      .from(ref.current)
      .save();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #thermal-ticket, #thermal-ticket * { visibility: visible !important; }
          #thermal-ticket { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div
        id="thermal-ticket"
        className="ticket-force-light overflow-hidden rounded-xl bg-white shadow-xl"
        style={{ width: "80mm", fontFamily: "monospace", fontSize: "11px", lineHeight: "1.35" }}
      >
        <div className="no-print flex items-center justify-between border-b px-3 py-2">
          <div className="font-semibold">{company.nom}</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePDF}
              disabled={blockFinalTicket}
              title={blockFinalTicket ? "Disponible apres validation" : undefined}
            >
              PDF
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              disabled={blockFinalTicket}
              title={blockFinalTicket ? "Disponible apres validation" : undefined}
            >
              Imprimer
            </button>
            <button type="button" onClick={onClose}>
              Fermer
            </button>
          </div>
        </div>

        <div ref={ref} className="px-3 py-3 text-black">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {company.logoUrl ? (
                <img
                  src={company.logoUrl}
                  alt="logo"
                  style={{ width: "34px", height: "34px", objectFit: "contain", flexShrink: 0 }}
                />
              ) : null}
              <div className="min-w-0">
                <p className="truncate text-[12px] font-bold uppercase leading-tight">{company.nom}</p>
                <p className="truncate text-[10px] leading-tight text-gray-700">{agencyLabel}</p>
              </div>
            </div>

            <div className="shrink-0 space-y-0.5 text-right text-[10px] leading-[1.25]">
              <p className="font-bold">Billet n° {receiptNumber}</p>
              <p>Emis le {emissionDate}</p>
              <p>Service : {serviceLabel}</p>
              {showAgentLine ? <p>Agent : {agentCode}</p> : null}
            </div>
          </div>

          <hr style={separatorStyle} />

          <div className="space-y-1 text-[11px]">
            <p className="flex items-baseline gap-1">
              <span className="w-[64px] shrink-0 text-gray-700">Passager :</span>
              <span className="min-w-0 flex-1 break-words font-semibold">{passengerName}</span>
            </p>
            <p className="flex items-baseline gap-1">
              <span className="w-[64px] shrink-0 text-gray-700">Telephone :</span>
              <span className="min-w-0 flex-1 break-words">{reservation.telephone || "-"}</span>
            </p>
          </div>

          <hr style={separatorStyle} />

          <div className="space-y-0.5 text-[11px]">
            <p className="text-[12px] font-bold leading-tight">Destination : {destinationLabel}</p>
            <p>Depart : {departureLabel}</p>
            <p>Places : {placesCount}</p>
          </div>

          <hr style={separatorStyle} />

          <div className="text-center">
            <p className="text-[15px] font-bold">Montant : {money(reservation.montant)}</p>
            <p className="text-[11px]">Paiement : {paymentLabel}</p>
          </div>

          {blockFinalTicket ? (
            <div
              className={`mt-2 rounded-lg border px-2.5 py-2 text-center text-[10px] leading-[1.35] ${
                isErrorEncaissement ? "border-red-300 bg-red-50 text-red-900" : "border-amber-300 bg-amber-50 text-amber-900"
              }`}
            >
              {isErrorEncaissement ? (
                <>
                  <strong>Encaissement en erreur</strong>
                  <br />
                  Relancez l'encaissement avant impression.
                </>
              ) : (
                <>
                  <strong>Encaissement en cours</strong>
                  <br />
                  Ticket final disponible apres validation.
                </>
              )}
            </div>
          ) : (
            <>
              <hr style={separatorStyle} />
              <div className="mt-1 flex justify-center">
                <QRCode value={qrValue} size={92} level="H" fgColor="#000000" />
              </div>
              <p className="mt-1 text-center text-[10px]">{DEFAULT_TICKET_MESSAGES.control}</p>
            </>
          )}

          <hr style={separatorStyle} />

          <div className="space-y-0.5 text-center text-[10px] leading-[1.3]">
            <p>{DEFAULT_TICKET_MESSAGES.arrival}</p>
            <p>{DEFAULT_TICKET_MESSAGES.keep}</p>
            <p>Merci d'avoir choisi {company.nom}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReceiptModal;
