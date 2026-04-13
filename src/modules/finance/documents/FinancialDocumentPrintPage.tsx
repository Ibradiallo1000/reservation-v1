import { useEffect, useMemo, useState } from "react";
import QRCode from "react-qr-code";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { ActionButton, StandardLayoutWrapper } from "@/ui";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebaseConfig";
import { shipmentsRef } from "@/modules/logistics/domain/firestorePaths";
import {
  FINANCIAL_DOCUMENT_STATUS_LABELS,
  FINANCIAL_DOCUMENT_TYPE_LABELS,
  type FinancialDocumentActor,
  type FinancialDocumentDoc,
} from "./financialDocuments.types";
import { getFinancialDocumentById, setFinancialDocumentStatus } from "./financialDocumentsService";

type ServiceLabel = "Billetterie" | "Courrier";

type HeaderData = {
  companyName: string;
  logoUrl: string | null;
  agencyName: string | null;
  city: string | null;
};

type SessionMetrics = {
  ticketCount: number | null;
  seatsCount: number | null;
  courierOperations: number | null;
};

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number" || typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "object" && value != null && "toDate" in value) {
    try {
      const d = (value as { toDate: () => Date }).toDate();
      return Number.isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
  return null;
}

function dateFr(value: unknown, withTime = false): string {
  const d = toDate(value);
  if (!d) return "-";
  if (!withTime) {
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function token(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function toFCFA(currency: unknown): string {
  const raw = String(currency ?? "").trim();
  const t = token(raw);
  if (!raw || t === "xof" || t === "fcfa" || t === "f_cfa") return "FCFA";
  return raw.toUpperCase();
}

function amountFr(value: unknown, currency: unknown): string {
  const n = Number(value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  return `${safe.toLocaleString("fr-FR")} ${toFCFA(currency)}`;
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function nearZero(v: number | null | undefined): boolean {
  return v == null || Math.abs(v) < 0.000001;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

function toLooseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const cleaned = raw
    .replace(/\s+/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  if (!cleaned || cleaned === "." || cleaned === "-" || cleaned === "-.") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const parsed = toLooseNumber(obj[k]);
    if (parsed != null) return parsed;
  }
  return null;
}

function firstNumber(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    if (value != null && Number.isFinite(value)) return value;
  }
  return null;
}

function countFr(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return Number(value).toLocaleString("fr-FR");
}

function findActor(actors: FinancialDocumentActor[], roles: string[]): FinancialDocumentActor | null {
  const wanted = roles.map((r) => token(r).replace(/[^a-z0-9_]/g, ""));
  return (
    actors.find((a) => {
      const r = token(a.role).replace(/[^a-z0-9_]/g, "");
      return wanted.some((w) => r === w || r.includes(w));
    }) ?? null
  );
}

function actorName(a: FinancialDocumentActor | null | undefined): string {
  const value = String(a?.name ?? "").trim();
  if (value.length > 0) return value;
  const uidFallback = String(a?.uid ?? "").trim();
  return uidFallback.length > 0 ? uidFallback : "-";
}

function lineValue(doc: FinancialDocumentDoc, labels: string[]): string | null {
  const keys = labels.map((l) => token(l).replace(/[^a-z0-9_]/g, ""));
  const row = doc.lineItems.find((it) => {
    const k = token(it.label).replace(/[^a-z0-9_]/g, "");
    return keys.some((q) => k.includes(q));
  });
  if (!row) return null;
  const v = String(row.value ?? "").trim();
  return v.length > 0 ? v : null;
}

function serviceLabel(doc: FinancialDocumentDoc): ServiceLabel {
  const d = typeof doc.details === "object" && doc.details != null ? (doc.details as Record<string, unknown>) : {};
  const t = token(pickString(d, ["sessionType", "canalPrincipal"]) ?? doc.service ?? doc.sourceType);
  return t.includes("courrier") || t.includes("courier") ? "Courrier" : "Billetterie";
}

function verificationUrl(pathname: string, search: string): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(search);
  params.set("verify", "1");
  const q = params.toString();
  return `${window.location.origin}${pathname}${q ? `?${q}` : ""}`;
}

export default function FinancialDocumentPrintPage() {
  const { user } = useAuth() as any;
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname, search } = location;
  const verifyMode = useMemo(() => new URLSearchParams(search).get("verify") === "1", [search]);
  const { companyId: routeCompanyId, documentId } = useParams<{ companyId: string; documentId: string }>();
  const companyId = routeCompanyId ?? user?.companyId ?? "";

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [docData, setDocData] = useState<(FinancialDocumentDoc & { id: string }) | null>(null);
  const [sessionMetrics, setSessionMetrics] = useState<SessionMetrics>({
    ticketCount: null,
    seatsCount: null,
    courierOperations: null,
  });
  const [header, setHeader] = useState<HeaderData>({
    companyName: "Compagnie",
    logoUrl: null,
    agencyName: null,
    city: null,
  });

  useEffect(() => {
    if (!companyId || !documentId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    let cancelled = false;
    const run = async () => {
      try {
        const [row, companySnap] = await Promise.all([
          getFinancialDocumentById(companyId, documentId),
          getDoc(doc(db, "companies", companyId)),
        ]);
        if (!row) {
          if (!cancelled) {
            setDocData(null);
            setSessionMetrics({
              ticketCount: null,
              seatsCount: null,
              courierOperations: null,
            });
          }
          return;
        }
        let agencyName = row.agencyName ?? null;
        let city = row.city ?? null;
        if (row.agencyId) {
          const agencySnap = await getDoc(doc(db, "companies", companyId, "agences", row.agencyId));
          if (agencySnap.exists()) {
            const a = agencySnap.data() as Record<string, unknown>;
            agencyName = agencyName ?? (String(a.nom ?? a.nomAgence ?? a.name ?? "").trim() || null);
            city = city ?? (String(a.ville ?? a.city ?? "").trim() || null);
          }
        }

        let metrics: SessionMetrics = {
          ticketCount: null,
          seatsCount: null,
          courierOperations: null,
        };
        try {
          if (row.documentType === "session_remittance" && row.agencyId && row.sourceId) {
            if (row.sourceType === "shift_session") {
              const shiftSnap = await getDoc(
                doc(db, "companies", companyId, "agences", row.agencyId, "shifts", row.sourceId)
              );
              if (shiftSnap.exists()) {
                const shiftData = shiftSnap.data() as Record<string, unknown>;
                const seatsCount = pickNumber(shiftData, [
                  "totalTickets",
                  "tickets",
                  "seatsSold",
                  "nombrePlaces",
                  "placesVendues",
                ]);
                const ticketCount = firstNumber(
                  pickNumber(shiftData, [
                    "totalReservations",
                    "reservationCount",
                    "reservations",
                    "nombreBillets",
                    "billetsVendus",
                  ]),
                  seatsCount
                );
                metrics = { ticketCount, seatsCount, courierOperations: null };
              }
            } else if (row.sourceType === "courier_session") {
              const courierSnap = await getDoc(
                doc(db, "companies", companyId, "agences", row.agencyId, "courierSessions", row.sourceId)
              );
              const courierData = courierSnap.exists()
                ? (courierSnap.data() as Record<string, unknown>)
                : {};
              let operations = pickNumber(courierData, [
                "operationCount",
                "operationsCount",
                "totalOperations",
                "operations",
                "shipmentCount",
                "colisCount",
              ]);
              if (operations == null) {
                const shipmentsSnap = await getDocs(
                  query(shipmentsRef(db, companyId), where("sessionId", "==", row.sourceId))
                );
                operations = shipmentsSnap.size;
              }
              metrics = { ticketCount: null, seatsCount: null, courierOperations: operations };
            }
          }
        } catch (metricError) {
          console.warn("[FinancialDocumentPrintPage] metrics fallback", metricError);
        }

        const companyData = companySnap.exists() ? (companySnap.data() as Record<string, unknown>) : {};
        const companyName = String(companyData.nom ?? companyData.name ?? "Compagnie").trim() || "Compagnie";
        const logoUrl = String(companyData.logoUrl ?? "").trim() || null;
        if (!cancelled) {
          setDocData(row);
          setSessionMetrics(metrics);
          setHeader({ companyName, logoUrl, agencyName, city });
        }
      } catch (err) {
        console.error("[FinancialDocumentPrintPage] load error", err);
        if (!cancelled) {
          setDocData(null);
          setSessionMetrics({
            ticketCount: null,
            seatsCount: null,
            courierOperations: null,
          });
          setLoadError("Impossible de charger le document a imprimer.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [companyId, documentId, reloadKey]);

  const backPath = useMemo(() => {
    const marker = "/documents/";
    const idx = pathname.lastIndexOf(marker);
    if (idx >= 0) return `${pathname.slice(0, idx)}/documents`;
    if (pathname.startsWith("/agence")) return "/agence/comptabilite/documents";
    return companyId ? `/compagnie/${companyId}/accounting/documents` : "/compagnie/documents";
  }, [companyId, pathname]);

  const qrValue = useMemo(() => verificationUrl(pathname, search), [pathname, search]);

  const handlePrint = async () => {
    if (companyId && docData) {
      await setFinancialDocumentStatus({
        companyId,
        documentId: docData.id,
        status: "printed",
        updatedByUid: user?.uid ?? null,
      }).catch((err) => console.warn("[FinancialDocumentPrintPage] unable to mark printed", err));
    }
    window.print();
  };

  if (!companyId) {
    return (
      <StandardLayoutWrapper className="space-y-4">
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">Compagnie introuvable.</div>
      </StandardLayoutWrapper>
    );
  }

  const service = docData ? serviceLabel(docData) : null;
  const amountForVerify = docData ? num(docData.amountDeclared) ?? num(docData.amountTotal) ?? num(docData.amountTheoretical) : null;

  const details = docData && typeof docData.details === "object" && docData.details != null ? (docData.details as Record<string, unknown>) : {};
  const actors = docData?.actors ?? [];
  const remitter = service === "Courrier"
    ? findActor(actors, ["agentCourrier", "agent_courrier", "courrier"])
    : findActor(actors, ["guichetier", "agent_billetterie", "billetterie", "seller"]);
  const accountant = findActor(actors, ["agency_accountant", "comptable_agence", "accountant", "comptable"]);

  const remitterName = actorName(remitter ?? actors[0]);
  const accountantName = actorName(accountant);
  const remitterRoleLabel = service === "Courrier" ? "Agent courrier" : "Agent billetterie";
  const transferInitiator = findActor(actors, ["initiateur", "initiator", "agency_accountant", "requester"]);
  const transferValidator = findActor(actors, [
    "validateur",
    "validator",
    "chefagence",
    "company_accountant",
    "company_ceo",
  ]);
  const transferExecutor = findActor(actors, ["executant", "carrier", "transporteur", "executant"]);

  const periodLabel =
    (docData?.periodLabel ?? pickString(details, ["periodeLibelle", "periodLabel"])) ||
    `${dateFr(details.periodStart ?? details.dateOuvertureSession)} -> ${dateFr(details.periodEnd ?? details.dateFermetureSession)}`;
  const billetsVendus = firstNumber(
    service === "Billetterie" ? sessionMetrics.ticketCount : null,
    pickNumber(details, ["billetsVendus", "nombreBillets", "ticketCount", "nbBillets"]),
    toLooseNumber(docData ? lineValue(docData, ["Billets vendus", "Nombre de billets"]) : null),
    service === "Billetterie" ? sessionMetrics.seatsCount : null
  );
  const placesVendues =
    service === "Billetterie"
      ? firstNumber(
          sessionMetrics.seatsCount,
          pickNumber(details, ["placesVendues", "nombrePlaces", "seatsSold"]),
          toLooseNumber(docData ? lineValue(docData, ["Places vendues", "Nombre de places"]) : null)
        )
      : null;
  const operationsCourrier =
    service === "Courrier"
      ? firstNumber(
          sessionMetrics.courierOperations,
          pickNumber(details, ["operationsCourrier", "nombreOperations", "operationCount", "operationsCount"]),
          toLooseNumber(docData ? lineValue(docData, ["Operations courrier", "Nombre operations"]) : null)
        )
      : null;
  const observationValue = String(docData?.observations ?? "").trim();

  const sessionRef =
    pickString(details, ["sessionId"]) ??
    (docData ? lineValue(docData, ["Session"]) : null) ??
    docData?.sourceId ??
    "-";
  const amountRemitted = num(docData?.amountDeclared) ?? num(docData?.amountTotal);
  const amountDiff = num(docData?.amountDifference);

  return (
    <StandardLayoutWrapper className="space-y-4">
      <style>
        {`
          @page { size: A4; margin: 10mm; }
          @media print {
            .no-print { display: none !important; }
            .print-page { box-shadow: none !important; border: none !important; margin: 0 !important; padding: 0 !important; width: 100% !important; max-width: none !important; }
            .compact { break-inside: avoid; page-break-inside: avoid; }
            .sign-box { min-height: 56px; }
            .resume-grid {
              display: grid !important;
              grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr) !important;
              column-gap: 0.75rem !important;
              row-gap: 0.5rem !important;
              align-items: start !important;
            }
            .resume-observation {
              break-inside: avoid;
              page-break-inside: avoid;
            }
            body { background: #fff !important; }
          }
        `}
      </style>

      <div className="no-print flex flex-wrap items-center gap-2">
        <ActionButton type="button" variant="secondary" onClick={() => navigate(backPath)}>Retour archives</ActionButton>
        {!verifyMode ? <ActionButton type="button" onClick={handlePrint}>Imprimer</ActionButton> : <ActionButton type="button" onClick={() => navigate(pathname)}>Retour document</ActionButton>}
      </div>

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">Chargement du document...</div>
      ) : loadError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <p className="font-semibold">Impossible de charger le document a imprimer</p>
          <p className="mt-1 text-amber-800">{loadError}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton type="button" onClick={() => setReloadKey((prev) => prev + 1)}>Reessayer</ActionButton>
            <ActionButton type="button" variant="secondary" onClick={() => navigate(backPath)}>Retour</ActionButton>
          </div>
        </div>
      ) : !docData ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">Document introuvable.</div>
      ) : verifyMode ? (
        <article className="print-page mx-auto w-full max-w-[680px] rounded-lg border border-gray-300 bg-white p-5 text-sm text-black">
          <h1 className="text-lg font-semibold">Verification du document</h1>
          <p className="mt-1 text-xs text-gray-600">Controle d'authenticite</p>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <p><span className="font-semibold">Type :</span> {FINANCIAL_DOCUMENT_TYPE_LABELS[docData.documentType]}</p>
            <p><span className="font-semibold">Numero document :</span> {docData.documentNumber || "-"}</p>
            <p><span className="font-semibold">Agence :</span> {header.agencyName ?? docData.agencyName ?? "-"}</p>
            <p><span className="font-semibold">Ville :</span> {header.city ?? docData.city ?? "-"}</p>
            <p><span className="font-semibold">Date :</span> {dateFr(docData.occurredAt)}</p>
            <p><span className="font-semibold">Service :</span> {service ?? "-"}</p>
            <p><span className="font-semibold">Montant :</span> {amountFr(amountForVerify, docData.currency)}</p>
            <p><span className="font-semibold">Statut :</span> {FINANCIAL_DOCUMENT_STATUS_LABELS[docData.status]}</p>
          </div>
        </article>
      ) : docData.documentType === "session_remittance" ? (
        <article className="print-page relative mx-auto w-full max-w-[800px] overflow-hidden rounded-lg border border-gray-300 bg-white p-4 text-[11px] leading-[1.2] text-black">
          <header className="compact relative border-b border-gray-300 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                {header.logoUrl ? <img src={header.logoUrl} alt="" className="h-14 w-14 rounded object-contain" /> : <div className="flex h-14 w-14 items-center justify-center rounded border border-gray-400 text-[10px]">LOGO</div>}
                <div>
                  <h1 className="text-base font-bold">{header.companyName}</h1>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="grid gap-1 text-right text-[10px]">
                  <p><span className="font-semibold">Numero :</span> {docData.documentNumber || "-"}</p>
                  <p><span className="font-semibold">Date remise :</span> {dateFr(docData.occurredAt)}</p>
                  <p><span className="font-semibold">Agence :</span> {header.agencyName ?? docData.agencyName ?? "-"}</p>
                  <p><span className="font-semibold">Ville :</span> {header.city ?? docData.city ?? "-"}</p>
                  <p><span className="font-semibold">Service :</span> {service}</p>
                </div>
                {qrValue ? <div className="rounded border border-gray-300 bg-white p-1"><QRCode value={qrValue} size={62} /></div> : null}
              </div>
            </div>
            <p className="mt-2 text-center text-[15px] font-semibold">Fiche de remise de session</p>
          </header>

          <section className="compact relative mt-3 rounded border border-gray-300 p-3">
            <h2 className="mb-2 text-sm font-semibold">Informations generales</h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <p><span className="font-semibold">Agence :</span> {header.agencyName ?? docData.agencyName ?? "-"}</p>
              <p><span className="font-semibold">Ville :</span> {header.city ?? docData.city ?? "-"}</p>
              <p><span className="font-semibold">Service :</span> {service}</p>
              <p><span className="font-semibold">Numero document :</span> {docData.documentNumber || "-"}</p>
              <p><span className="font-semibold">Date de remise :</span> {dateFr(docData.occurredAt)}</p>
            </div>
          </section>

          <section className="compact relative mt-3 rounded border border-gray-300 p-3">
            <h2 className="mb-2 text-sm font-semibold">Resume de la remise</h2>
            <div className="resume-grid grid grid-cols-1 gap-2 md:grid-cols-2">
              <div className="space-y-1">
                <p><span className="font-semibold">{remitterRoleLabel} :</span> {remitterName}</p>
                <p><span className="font-semibold">Comptable agence :</span> {accountantName}</p>
                <p><span className="font-semibold">Chef d'agence :</span> Visa a apposer</p>
                <p><span className="font-semibold">Periode de vente :</span> {periodLabel}</p>
                {service === "Courrier" ? (
                  <p><span className="font-semibold">Operations courrier :</span> {countFr(operationsCourrier)}</p>
                ) : (
                  <>
                    <p><span className="font-semibold">Billets vendus :</span> {countFr(billetsVendus)}</p>
                    {placesVendues != null ? (
                      <p><span className="font-semibold">Places vendues :</span> {countFr(placesVendues)}</p>
                    ) : null}
                  </>
                )}
              </div>
              <div className="resume-right space-y-1">
                <p><span className="font-semibold">Montant attendu :</span> {amountFr(docData.amountTheoretical, docData.currency)}</p>
                <p><span className="font-semibold">Montant remis :</span> {amountFr(amountRemitted, docData.currency)}</p>
                <p><span className="font-semibold">Ecart :</span> {amountFr(amountDiff, docData.currency)}</p>
              </div>
            </div>
            <div className="resume-observation mt-2 border-t border-gray-200 pt-2">
              <p className="font-semibold">Observation :</p>
              {observationValue ? (
                <p className="mt-1 whitespace-pre-wrap">{observationValue}</p>
              ) : (
                <div className="mt-1 min-h-[28px] rounded border border-dashed border-gray-300" />
              )}
            </div>
          </section>

          <section className="compact relative mt-3 rounded border border-gray-300 p-3">
            <h2 className="mb-2 text-sm font-semibold">Signatures et cachet</h2>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <div className="rounded border border-gray-300 p-2"><p className="font-semibold">Signature agent remettant</p><div className="sign-box mt-2 h-16 border-b border-gray-400" /></div>
              <div className="rounded border border-gray-300 p-2"><p className="font-semibold">Signature comptable receveur</p><div className="sign-box mt-2 h-16 border-b border-gray-400" /></div>
              <div className="rounded border border-gray-300 p-2"><p className="font-semibold">Visa chef d'agence</p><div className="sign-box mt-2 h-16 border-b border-gray-400" /></div>
              <div className="rounded border border-gray-300 p-2"><p className="font-semibold">Cachet agence</p><div className="sign-box mt-2 h-16 border border-dashed border-gray-400" /></div>
            </div>
          </section>
        </article>
      ) : docData.documentType === "accounting_remittance_receipt" ? (
        <article className="print-page relative mx-auto w-full max-w-[760px] overflow-hidden rounded-lg border border-gray-300 bg-white p-4 text-[11px] leading-[1.2] text-black">
          {header.logoUrl ? <img src={header.logoUrl} alt="" className="pointer-events-none absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.025] grayscale" /> : null}

          <header className="compact relative border-b border-gray-300 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                {header.logoUrl ? <img src={header.logoUrl} alt="" className="h-12 w-12 rounded object-contain" /> : <div className="flex h-12 w-12 items-center justify-center rounded border border-gray-400 text-[10px]">LOGO</div>}
                <div>
                  <h1 className="text-base font-bold">{header.companyName}</h1>
                  <p className="text-sm font-semibold">Recu de remise comptable</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="grid gap-1 text-right text-[10px]">
                  <p><span className="font-semibold">Numero :</span> {docData.documentNumber || "-"}</p>
                  <p><span className="font-semibold">Date :</span> {dateFr(docData.occurredAt, true)}</p>
                  <p><span className="font-semibold">Agence :</span> {header.agencyName ?? docData.agencyName ?? "-"}</p>
                  <p><span className="font-semibold">Service :</span> {service}</p>
                </div>
                {qrValue ? <div className="rounded border border-gray-300 bg-white p-1"><QRCode value={qrValue} size={60} /></div> : null}
              </div>
            </div>
          </header>

          <section className="compact relative mt-3 rounded border border-gray-300 p-3">
            <h2 className="mb-2 text-sm font-semibold">Informations generales</h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <p><span className="font-semibold">Agence :</span> {header.agencyName ?? docData.agencyName ?? "-"}</p>
              <p><span className="font-semibold">Service :</span> {service}</p>
              <p><span className="font-semibold">Numero document :</span> {docData.documentNumber || "-"}</p>
              <p><span className="font-semibold">Date :</span> {dateFr(docData.occurredAt, true)}</p>
            </div>
          </section>

          <section className="compact relative mt-3 rounded border border-gray-300 p-3">
            <h2 className="mb-2 text-sm font-semibold">Resume de la remise</h2>
            <div className="space-y-1">
              <p><span className="font-semibold">{remitterRoleLabel} :</span> {remitterName}</p>
              <p><span className="font-semibold">Comptable agence :</span> {accountantName}</p>
              <p><span className="font-semibold">Montant remis :</span> {amountFr(amountRemitted, docData.currency)}</p>
              {!nearZero(amountDiff) ? <p><span className="font-semibold">Ecart :</span> {amountFr(amountDiff, docData.currency)}</p> : null}
              <p><span className="font-semibold">Session :</span> {sessionRef}</p>
            </div>
          </section>

          <section className="compact relative mt-3 rounded border border-gray-300 p-3">
            <h2 className="mb-2 text-sm font-semibold">Signatures et cachet</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded border border-gray-300 p-2"><p className="font-semibold">Signature agent remettant</p><div className="sign-box mt-2 h-14 border-b border-gray-400" /></div>
              <div className="rounded border border-gray-300 p-2"><p className="font-semibold">Signature comptable receveur</p><div className="sign-box mt-2 h-14 border-b border-gray-400" /></div>
              <div className="rounded border border-gray-300 p-2"><p className="font-semibold">Cachet agence</p><div className="sign-box mt-2 h-14 border border-dashed border-gray-400" /></div>
            </div>
          </section>
        </article>
      ) : docData.documentType === "treasury_internal_transfer_slip" ? (
        <article className="print-page relative mx-auto w-full max-w-[800px] overflow-hidden rounded-lg border border-gray-300 bg-white p-4 text-[11px] leading-[1.25] text-black">
          <header className="compact border-b border-gray-300 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                {header.logoUrl ? <img src={header.logoUrl} alt="" className="h-12 w-12 rounded object-contain" /> : <div className="flex h-12 w-12 items-center justify-center rounded border border-gray-400 text-[10px]">LOGO</div>}
                <div>
                  <h1 className="text-base font-bold">{header.companyName}</h1>
                  <p className="text-sm font-semibold">{String(docData.title ?? "").trim() || "Bordereau de sortie inter-agence"}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="grid gap-1 text-right text-[10px]">
                  <p><span className="font-semibold">Numero :</span> {docData.documentNumber || "-"}</p>
                  <p><span className="font-semibold">Date :</span> {dateFr(docData.occurredAt, true)}</p>
                  <p><span className="font-semibold">Agence :</span> {header.agencyName ?? docData.agencyName ?? "-"}</p>
                  <p><span className="font-semibold">Ville :</span> {header.city ?? docData.city ?? "-"}</p>
                </div>
                {qrValue ? <div className="rounded border border-gray-300 bg-white p-1"><QRCode value={qrValue} size={60} /></div> : null}
              </div>
            </div>
          </header>

          <section className="compact mt-3 rounded border border-gray-300 p-3">
            <h2 className="mb-2 text-sm font-semibold">Informations generales</h2>
            <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
              <p><span className="font-semibold">Source :</span> {lineValue(docData, ["Source"]) ?? "-"}</p>
              <p><span className="font-semibold">Destination :</span> {lineValue(docData, ["Destination"]) ?? "-"}</p>
              <p><span className="font-semibold">Montant :</span> {amountFr(docData.amountTotal, docData.currency)}</p>
              <p><span className="font-semibold">Reference :</span> {docData.businessReference || "-"}</p>
              <p className="sm:col-span-2"><span className="font-semibold">Motif :</span> {lineValue(docData, ["Motif"]) ?? (String(docData.observations ?? "-").trim() || "-")}</p>
            </div>
          </section>

          <section className="compact mt-3 rounded border border-gray-300 p-3">
            <h2 className="mb-2 text-sm font-semibold">Responsabilites</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <p><span className="font-semibold">Demandeur :</span> {actorName(transferInitiator)}</p>
              <p><span className="font-semibold">Autorisateur :</span> {actorName(transferValidator)}</p>
              <p><span className="font-semibold">Executant / receveur :</span> {actorName(transferExecutor)}</p>
            </div>
          </section>

          <section className="compact mt-3 rounded border border-gray-300 p-3">
            <h2 className="mb-2 text-sm font-semibold">Signatures et cachet</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <div className="rounded border border-gray-300 p-2"><p className="font-semibold">Demandeur</p><div className="sign-box mt-2 h-14 border-b border-gray-400" /></div>
              <div className="rounded border border-gray-300 p-2"><p className="font-semibold">Autorisateur</p><div className="sign-box mt-2 h-14 border-b border-gray-400" /></div>
              <div className="rounded border border-gray-300 p-2"><p className="font-semibold">Executant / receveur</p><div className="sign-box mt-2 h-14 border-b border-gray-400" /></div>
              <div className="rounded border border-gray-300 p-2"><p className="font-semibold">Cachet agence</p><div className="sign-box mt-2 h-14 border border-dashed border-gray-400" /></div>
            </div>
          </section>
        </article>
      ) : docData.documentType === "treasury_transfer" ? (
        <article className="print-page relative mx-auto w-full max-w-[800px] overflow-hidden rounded-lg border border-gray-300 bg-white p-4 text-[11px] leading-[1.25] text-black">
          <header className="compact border-b border-gray-300 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                {header.logoUrl ? <img src={header.logoUrl} alt="" className="h-12 w-12 rounded object-contain" /> : <div className="flex h-12 w-12 items-center justify-center rounded border border-gray-400 text-[10px]">LOGO</div>}
                <div>
                  <h1 className="text-base font-bold">{header.companyName}</h1>
                  <p className="text-sm font-semibold">Ordre de sortie vers banque</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="grid gap-1 text-right text-[10px]">
                  <p><span className="font-semibold">Numero :</span> {docData.documentNumber || "-"}</p>
                  <p><span className="font-semibold">Date :</span> {dateFr(docData.occurredAt, true)}</p>
                  <p><span className="font-semibold">Agence :</span> {header.agencyName ?? docData.agencyName ?? "-"}</p>
                  <p><span className="font-semibold">Ville :</span> {header.city ?? docData.city ?? "-"}</p>
                </div>
                {qrValue ? <div className="rounded border border-gray-300 bg-white p-1"><QRCode value={qrValue} size={60} /></div> : null}
              </div>
            </div>
          </header>

          <section className="compact mt-3 rounded border border-gray-300 p-3">
            <h2 className="mb-2 text-sm font-semibold">Informations generales</h2>
            <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
              <p><span className="font-semibold">Banque :</span> {pickString(details, ["bankName"]) ?? lineValue(docData, ["Banque"]) ?? "-"}</p>
              <p><span className="font-semibold">Agence bancaire :</span> {pickString(details, ["bankBranchName"]) ?? lineValue(docData, ["Agence bancaire"]) ?? "-"}</p>
              <p><span className="font-semibold">Montant autorise :</span> {amountFr(docData.amountTotal, docData.currency)}</p>
              <p><span className="font-semibold">Reference :</span> {docData.businessReference || "-"}</p>
              <p className="sm:col-span-2"><span className="font-semibold">Motif :</span> {String(docData.observations ?? "-").trim() || "-"}</p>
            </div>
          </section>

          <section className="compact mt-3 rounded border border-gray-300 p-3">
            <h2 className="mb-2 text-sm font-semibold">Responsabilites</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <p><span className="font-semibold">Demandeur :</span> {actorName(transferInitiator)}</p>
              <p><span className="font-semibold">Autorisateur :</span> {actorName(transferValidator)}</p>
              <p><span className="font-semibold">Executant :</span> {actorName(transferExecutor)}</p>
            </div>
          </section>

          <section className="compact mt-3 rounded border border-gray-300 p-3">
            <h2 className="mb-2 text-sm font-semibold">Signatures et cachet</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <div className="rounded border border-gray-300 p-2"><p className="font-semibold">Demandeur</p><div className="sign-box mt-2 h-14 border-b border-gray-400" /></div>
              <div className="rounded border border-gray-300 p-2"><p className="font-semibold">Autorisateur</p><div className="sign-box mt-2 h-14 border-b border-gray-400" /></div>
              <div className="rounded border border-gray-300 p-2"><p className="font-semibold">Executant</p><div className="sign-box mt-2 h-14 border-b border-gray-400" /></div>
              <div className="rounded border border-gray-300 p-2"><p className="font-semibold">Cachet agence</p><div className="sign-box mt-2 h-14 border border-dashed border-gray-400" /></div>
            </div>
          </section>
        </article>
      ) : docData.documentType === "bank_deposit_slip" ? (
        <article className="print-page relative mx-auto w-full max-w-[800px] overflow-hidden rounded-lg border border-gray-300 bg-white p-4 text-[11px] leading-[1.25] text-black">
          <header className="compact border-b border-gray-300 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                {header.logoUrl ? <img src={header.logoUrl} alt="" className="h-12 w-12 rounded object-contain" /> : <div className="flex h-12 w-12 items-center justify-center rounded border border-gray-400 text-[10px]">LOGO</div>}
                <div>
                  <h1 className="text-base font-bold">{header.companyName}</h1>
                  <p className="text-sm font-semibold">Bordereau de dépôt confirmé</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="grid gap-1 text-right text-[10px]">
                  <p><span className="font-semibold">Numero :</span> {docData.documentNumber || "-"}</p>
                  <p><span className="font-semibold">Date dépôt :</span> {dateFr(docData.occurredAt, true)}</p>
                  <p><span className="font-semibold">Agence :</span> {header.agencyName ?? docData.agencyName ?? "-"}</p>
                  <p><span className="font-semibold">Ville :</span> {header.city ?? docData.city ?? "-"}</p>
                </div>
                {qrValue ? <div className="rounded border border-gray-300 bg-white p-1"><QRCode value={qrValue} size={60} /></div> : null}
              </div>
            </div>
          </header>

          <section className="compact mt-3 rounded border border-gray-300 p-3">
            <h2 className="mb-2 text-sm font-semibold">Informations générales</h2>
            <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
              <p><span className="font-semibold">Banque :</span> {lineValue(docData, ["Banque"]) ?? "-"}</p>
              <p><span className="font-semibold">Agence bancaire :</span> {lineValue(docData, ["Agence bancaire"]) ?? "-"}</p>
              <p><span className="font-semibold">Montant déposé :</span> {amountFr(docData.amountTotal, docData.currency)}</p>
              <p><span className="font-semibold">Numéro du reçu / bordereau banque :</span> {lineValue(docData, ["Référence dépôt", "Reference depot"]) ?? docData.businessReference ?? "-"}</p>
              <p className="sm:col-span-2"><span className="font-semibold">Observation :</span> {String(docData.observations ?? "-").trim() || "-"}</p>
            </div>
          </section>

          <section className="compact mt-3 rounded border border-gray-300 p-3">
            <h2 className="mb-2 text-sm font-semibold">Responsabilités</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <p><span className="font-semibold">Comptable saisissant :</span> {actorName(transferInitiator)}</p>
              <p><span className="font-semibold">Déposant / exécutant :</span> {actorName(transferExecutor)}</p>
            </div>
          </section>

          <section className="compact mt-3 rounded border border-gray-300 p-3">
            <h2 className="mb-2 text-sm font-semibold">Signatures et cachet</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded border border-gray-300 p-2"><p className="font-semibold">Comptable saisissant</p><div className="sign-box mt-2 h-14 border-b border-gray-400" /></div>
              <div className="rounded border border-gray-300 p-2"><p className="font-semibold">Déposant</p><div className="sign-box mt-2 h-14 border-b border-gray-400" /></div>
              <div className="rounded border border-gray-300 p-2"><p className="font-semibold">Cachet agence</p><div className="sign-box mt-2 h-14 border border-dashed border-gray-400" /></div>
            </div>
          </section>
        </article>
      ) : (
        <article className="print-page rounded-lg border border-gray-300 bg-white p-6 text-black">
          <header className="border-b border-gray-300 pb-3">
            <h1 className="text-lg font-bold">{header.companyName}</h1>
            <p className="text-sm font-semibold">{FINANCIAL_DOCUMENT_TYPE_LABELS[docData.documentType]}</p>
          </header>
          <section className="mt-4 text-sm">
            <p><span className="font-semibold">Numero document :</span> {docData.documentNumber || "-"}</p>
            <p><span className="font-semibold">Date :</span> {dateFr(docData.occurredAt, true)}</p>
            <p><span className="font-semibold">Agence :</span> {header.agencyName ?? docData.agencyName ?? "-"}</p>
            <p><span className="font-semibold">Montant :</span> {amountFr(docData.amountTotal, docData.currency)}</p>
          </section>
        </article>
      )}
    </StandardLayoutWrapper>
  );
}
