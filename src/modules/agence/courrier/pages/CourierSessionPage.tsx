// src/modules/agence/courrier/pages/CourierSessionPage.tsx
// Courier sessions aligned with Ticket (Guichet) shift architecture: PENDING → ACTIVE → CLOSED → VALIDATED.

import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { db } from "@/firebaseConfig";
import { collection, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { createCourierSession, closeCourierSession as closeCourierSessionService } from "@/modules/logistics/services/courierSessionService";
import { courierSessionsRef, courierSessionRef } from "@/modules/logistics/domain/courierSessionPaths";
import { shipmentsRef } from "@/modules/logistics/domain/firestorePaths";
import type { CourierSession } from "@/modules/logistics/domain/courierSession.types";
import type { Shipment } from "@/modules/logistics/domain/shipment.types";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import CourierSessionLivePanel from "../components/CourierSessionLivePanel";
import CourierPageHeader from "../components/CourierPageHeader";
import CourierReceipt from "../components/CourierReceipt";
import CourierPackageLabel from "../components/CourierPackageLabel";
import { LayoutDashboard, Loader2, AlertCircle, Plus } from "lucide-react";
import { Link } from "react-router-dom";

export default function CourierSessionPage() {
  const { user, company } = useAuth() as {
    user: { uid: string; companyId?: string; agencyId?: string; displayName?: string; agencyNom?: string };
    company: { nom?: string; logoUrl?: string } | null;
  };
  const money = useFormatCurrency();
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const agentId = user?.uid ?? "";
  const agentName = user?.displayName ?? "Agent";
  const agencyName = user?.agencyNom ?? "Agence";
  const companyName = company?.nom ?? "Compagnie";
  const companyLogoUrl = company?.logoUrl ?? undefined;
  const theme = useCompanyTheme(company);
  const primaryColor = theme?.colors?.primary ?? "#ea580c";
  const secondaryColor = theme?.colors?.secondary ?? "#f97316";

  const [session, setSession] = useState<CourierSession | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [receiptShipment, setReceiptShipment] = useState<Shipment | null>(null);
  const [labelShipment, setLabelShipment] = useState<Shipment | null>(null);
  const [agencies, setAgencies] = useState<{ id: string; nomAgence?: string; nom?: string }[]>([]);
  const agentCode = (user as { staffCode?: string; codeCourt?: string; code?: string })?.staffCode
    ?? (user as { codeCourt?: string; code?: string })?.codeCourt
    ?? (user as { code?: string })?.code
    ?? "COUR";

  useEffect(() => {
    if (!companyId) return;
    getDocs(collection(db, "companies", companyId, "agences")).then((snap) => {
      setAgencies(snap.docs.map((d) => ({ id: d.id, ...d.data() } as { id: string; nomAgence?: string; nom?: string })));
    });
  }, [companyId]);

  // Subscribe to courier sessions for this agent (most recent = current or last closed)
  useEffect(() => {
    if (!companyId || !agencyId || !agentId) return;
    const col = courierSessionsRef(db, companyId, agencyId);
    const unsub = onSnapshot(query(col, where("agentId", "==", agentId)), (snap) => {
      const sorted = [...snap.docs].sort((a, b) => {
        const aT = (a.data().createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
        const bT = (b.data().createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
        return bT - aT;
      });
      if (sorted.length > 0) {
        const d = sorted[0];
        setSessionId(d.id);
        setSession({ ...d.data(), sessionId: d.id } as CourierSession);
      } else {
        setSessionId(null);
        setSession(null);
      }
    });
    return () => unsub();
  }, [companyId, agencyId, agentId]);

  // When we have a sessionId, also subscribe to that doc so we get CLOSED/VALIDATED updates
  useEffect(() => {
    if (!companyId || !agencyId || !sessionId) return;
    const sessionRef = courierSessionRef(db, companyId, agencyId, sessionId);
    const unsub = onSnapshot(sessionRef, (snap) => {
      if (snap.exists()) {
        setSession({ ...snap.data(), sessionId: snap.id } as CourierSession);
      }
    });
    return () => unsub();
  }, [companyId, agencyId, sessionId]);

  // Load shipments for this session (by sessionId on shipment)
  useEffect(() => {
    if (!companyId || !sessionId) {
      setShipments([]);
      return;
    }
    const shipCol = shipmentsRef(db, companyId);
    const q = query(shipCol, where("sessionId", "==", sessionId));
    const unsub = onSnapshot(q, (snap) => {
      setShipments(snap.docs.map((d) => d.data() as Shipment));
    });
    return () => unsub();
  }, [companyId, sessionId]);

  const handleOpenSession = async () => {
    setError(null);
    setLoading(true);
    try {
      await createCourierSession({ companyId, agencyId, agentId, agentCode });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur ouverture session");
    } finally {
      setLoading(false);
    }
  };

  const handleCloseSession = async () => {
    if (!sessionId) return;
    setError(null);
    setLoading(true);
    try {
      await closeCourierSessionService({ companyId, agencyId, sessionId });
      setShowCloseModal(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur fermeture session");
    } finally {
      setLoading(false);
    }
  };

  const totalPaid = (s: Shipment) => s.transportFee + (s.insuranceAmount ?? 0);
  const destinationAgencyName = (destId: string) =>
    agencies.find((a) => a.id === destId)?.nomAgence ?? agencies.find((a) => a.id === destId)?.nom ?? (destId || "—");

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      <CourierPageHeader
        icon={LayoutDashboard}
        title="Session Courrier"
        primaryColor={primaryColor}
        right={
          session?.status === "ACTIVE" ? (
            <Link
              to="/agence/courrier/nouveau"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2.5 text-white transition-colors duration-200 hover:opacity-90 active:opacity-95"
              style={{ backgroundColor: "var(--courier-primary, #ea580c)" }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = "var(--courier-secondary, #f97316)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = "var(--courier-primary, #ea580c)";
              }}
            >
              <Plus className="h-4 w-4" />
              Nouvel envoi
            </Link>
          ) : undefined
        }
      />

      <CourierSessionLivePanel
        session={session}
        shipments={shipments}
        agencyName={agencyName}
        primaryColor={primaryColor}
        secondaryColor={secondaryColor}
      />

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-800 border border-red-200">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="ml-auto underline">Fermer</button>
        </div>
      )}

      <section className="rounded-xl border border-gray-200/80 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 flex items-center gap-2 font-semibold text-gray-800">
          <LayoutDashboard className="h-5 w-5" style={{ color: "var(--courier-primary, #ea580c)" }} />
          Session
        </h2>
        {!session || (session.status !== "PENDING" && session.status !== "ACTIVE") ? (
          <div>
            <p className="text-gray-600 mb-3">
              {!session
                ? "Aucune session. Créez une session (elle sera en attente d'activation par le comptable)."
                : "Session clôturée ou validée. Créez une nouvelle session pour enregistrer des envois."}
            </p>
            <button
              type="button"
              onClick={handleOpenSession}
              disabled={loading}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2.5 text-white transition-colors duration-200 disabled:opacity-50"
              style={{ backgroundColor: "var(--courier-primary, #ea580c)" }}
              onMouseOver={(e) => { if (!loading) e.currentTarget.style.backgroundColor = "var(--courier-secondary, #f97316)"; }}
              onMouseOut={(e) => { e.currentTarget.style.backgroundColor = "var(--courier-primary, #ea580c)"; }}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Créer une session
            </button>
          </div>
        ) : null}
        {session && session.status !== "PENDING" && session.status !== "ACTIVE" ? (
          <div className="mt-4 p-3 rounded-lg bg-gray-50 border border-gray-200">
            <p className="text-sm text-gray-600">
              Dernière session : <span className="font-medium">{session.status === "CLOSED" ? "Clôturée" : "Validée"}</span>
              {" — "}
              Montant attendu : <span className="font-mono">{money(session.expectedAmount ?? 0)}</span>
            </p>
          </div>
        ) : null}
        {session && (session.status === "PENDING" || session.status === "ACTIVE") ? (
          <div className="space-y-2">
            <p className="text-gray-700">
              <span className="font-medium">Statut :</span>{" "}
              <span className={session.status === "ACTIVE" ? "text-green-700" : session.status === "CLOSED" || session.status === "VALIDATED" ? "text-gray-600" : "text-amber-700"}>
                {session.status === "PENDING" && "En attente d'activation par le comptable"}
                {session.status === "ACTIVE" && "Active"}
                {session.status === "CLOSED" && "Clôturée"}
                {session.status === "VALIDATED" && "Validée"}
              </span>
            </p>
            {(session.status === "CLOSED" || session.status === "VALIDATED") && (
              <p className="text-gray-700">
                <span className="font-medium">Montant attendu :</span>{" "}
                <span className="font-mono">{money(session.expectedAmount ?? 0)}</span>
              </p>
            )}
            {session.status === "ACTIVE" && (
              <button
                type="button"
                onClick={() => setShowCloseModal(true)}
                disabled={loading}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border px-4 py-2.5 transition-colors duration-200 disabled:opacity-50"
                style={{ borderColor: "var(--courier-primary, #ea580c)", color: "var(--courier-primary, #ea580c)" }}
                onMouseOver={(e) => { if (!loading) { e.currentTarget.style.backgroundColor = "var(--courier-primary, #ea580c)"; e.currentTarget.style.color = "#fff"; } }}
                onMouseOut={(e) => { e.currentTarget.style.backgroundColor = ""; e.currentTarget.style.color = "var(--courier-primary, #ea580c)"; }}
              >
                Fermer la session
              </button>
            )}
          </div>
        ) : null}
      </section>

      {/* Close session modal — no counted amount (computed at close; validation by accountant later) */}
      {showCloseModal && sessionId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-semibold mb-2">Fermer la session</h3>
            <p className="text-gray-600 text-sm mb-4">Le montant attendu sera calculé à partir des envois de cette session.</p>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowCloseModal(false)} className="min-h-[44px] rounded-lg border border-gray-300 px-4 py-2.5 transition-colors duration-200 hover:bg-gray-50">
                Annuler
              </button>
              <button type="button" onClick={handleCloseSession} disabled={loading} className="min-h-[44px] rounded-lg px-4 py-2.5 text-white transition-colors duration-200 disabled:opacity-50" style={{ backgroundColor: "var(--courier-primary, #ea580c)" }} onMouseOver={(e) => { if (!loading) e.currentTarget.style.backgroundColor = "var(--courier-secondary, #f97316)"; }} onMouseOut={(e) => { e.currentTarget.style.backgroundColor = "var(--courier-primary, #ea580c)"; }}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : null} Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {sessionId && (
        <section className="rounded-xl border border-gray-200/80 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-gray-800">
            <span style={{ color: "var(--courier-primary, #ea580c)" }}>📦</span>
            Envois de la session
          </h2>
          {shipments.length === 0 ? (
            <p className="text-gray-500 text-sm">Aucun envoi pour cette session.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-100 text-left font-semibold text-gray-700">
                    <th className="p-3">ID</th>
                    <th className="p-3">Expéditeur</th>
                    <th className="p-3">Destinataire</th>
                    <th className="p-3">Total payé</th>
                    <th className="p-3">Statut</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {shipments.map((s, i) => (
                    <tr key={s.shipmentId} className={`border-b ${i % 2 === 1 ? "bg-gray-50" : ""}`}>
                      <td className="p-3 font-mono">{s.shipmentNumber ?? s.shipmentId}</td>
                      <td className="p-3">{s.sender?.name ?? "—"}</td>
                      <td className="p-3">{s.receiver?.name ?? "—"}</td>
                      <td className="p-3">{money(totalPaid(s))}</td>
                      <td className="p-3">{s.currentStatus}</td>
                      <td className="flex flex-wrap gap-2 p-3">
                        <button type="button" onClick={() => setReceiptShipment(s)} className="min-h-[44px] px-3 py-2 text-sm font-medium transition-colors duration-200" style={{ color: "var(--courier-primary, #ea580c)" }}>Reçu</button>
                        <button type="button" onClick={() => setLabelShipment(s)} className="min-h-[44px] px-3 py-2 text-sm font-medium transition-colors duration-200" style={{ color: "var(--courier-secondary, #f97316)" }}>Étiquette</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {receiptShipment && (
        <CourierReceipt
          shipment={receiptShipment}
          companyName={companyName}
          companyLogoUrl={companyLogoUrl}
          agencyName={agencyName}
          agentName={agentName}
          agentCode={agentCode}
          onClose={() => setReceiptShipment(null)}
        />
      )}
      {labelShipment && (
        <CourierPackageLabel
          shipment={labelShipment}
          destinationAgencyName={destinationAgencyName(labelShipment.destinationAgencyId)}
          originAgencyName={agencyName}
          onClose={() => setLabelShipment(null)}
        />
      )}
    </div>
  );
}
