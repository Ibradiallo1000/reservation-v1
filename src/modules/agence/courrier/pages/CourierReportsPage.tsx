// CourierReportsPage.tsx — Session report: shipments created, origin revenue, delivered, destination revenue, global total, difference if validated.

import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { db } from "@/firebaseConfig";
import { onSnapshot, query, where } from "firebase/firestore";
import { courierSessionsRef } from "@/modules/logistics/domain/courierSessionPaths";
import { shipmentsRef } from "@/modules/logistics/domain/firestorePaths";
import type { CourierSession } from "@/modules/logistics/domain/courierSession.types";
import type { Shipment } from "@/modules/logistics/domain/shipment.types";
import type { Company } from "@/types/companyTypes";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { FileText, Package, Banknote, Truck, Wallet } from "lucide-react";
import CourierPageHeader from "../components/CourierPageHeader";

export default function CourierReportsPage() {
  const { user, company } = useAuth() as { user: { uid: string; companyId?: string; agencyId?: string }; company: unknown };
  const theme = useCompanyTheme(company as Company | null);
  const primaryColor = theme?.colors?.primary ?? "#ea580c";
  const secondaryColor = theme?.colors?.secondary ?? "#f97316";
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const money = useFormatCurrency();
  const [sessions, setSessions] = useState<(CourierSession & { id: string })[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);

  useEffect(() => {
    if (!companyId || !agencyId) return;
    const col = courierSessionsRef(db, companyId, agencyId);
    const unsub = onSnapshot(col, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CourierSession & { id: string }));
      setSessions(list.sort((a, b) => {
        const aT = (a.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
        const bT = (b.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
        return bT - aT;
      }));
    });
    return () => unsub();
  }, [companyId, agencyId]);

  useEffect(() => {
    if (!companyId) return;
    const q = query(shipmentsRef(db, companyId), where("originAgencyId", "==", agencyId));
    const unsub = onSnapshot(q, (snap) => {
      setShipments(snap.docs.map((d) => d.data() as Shipment));
    });
    return () => unsub();
  }, [companyId, agencyId]);

  const sessionShipments = (sessionId: string) =>
    shipments.filter((s) => s.sessionId === sessionId);
  const originRevenue = (sessionId: string) =>
    sessionShipments(sessionId).reduce((sum, s) => sum + (s.transportFee ?? 0) + (s.insuranceAmount ?? 0), 0);
  const deliveredShipments = (sessionId: string) =>
    sessionShipments(sessionId).filter((s) => s.currentStatus === "DELIVERED" || s.currentStatus === "CLOSED");
  const destinationRevenue = (sessionId: string) =>
    deliveredShipments(sessionId).reduce(
      (sum, s) => sum + (s.destinationCollectedAmount ?? 0),
      0
    );
  const globalTotal = (sessionId: string) => originRevenue(sessionId) + destinationRevenue(sessionId);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <CourierPageHeader
        icon={FileText}
        title="Rapport Session"
        primaryColor={primaryColor}
        description="Synthèse des sessions et envois : créés, livrés, totaux origine/destination, écart si validé."
      />

      <div className="space-y-6">
        {sessions.map((session) => {
          const created = sessionShipments(session.id);
          const delivered = deliveredShipments(session.id);
          const origin = originRevenue(session.id);
          const dest = destinationRevenue(session.id);
          const total = globalTotal(session.id);
          return (
            <section key={session.id} className="rounded-xl border border-gray-200/80 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold" style={{ color: "var(--courier-primary, #ea580c)" }}>
                <FileText className="h-5 w-5" style={{ color: "var(--courier-primary, #ea580c)" }} aria-hidden />
                Session {session.id.slice(0, 8)} — {session.status} — Agent {session.agentCode}
              </h2>
              <div className="mb-4 grid grid-cols-1 gap-4 xs:grid-cols-2 sm:grid-cols-4">
                <div className="flex flex-col rounded-xl border border-gray-100 bg-gray-50/80 p-4 shadow-sm">
                  <Package className="mb-1 h-5 w-5 text-gray-500" aria-hidden />
                  <span className="text-xs font-medium uppercase text-gray-500">Envois créés</span>
                  <span className="mt-1 text-2xl font-bold text-gray-800">{created.length}</span>
                </div>
                <div
                  className="flex flex-col rounded-xl border p-4 shadow-sm"
                  style={{ borderColor: "color-mix(in srgb, var(--courier-primary, #ea580c) 25%, transparent)", backgroundColor: "color-mix(in srgb, var(--courier-primary, #ea580c) 5%, transparent)" }}
                >
                  <Banknote className="mb-1 h-5 w-5" style={{ color: "var(--courier-primary, #ea580c)" }} aria-hidden />
                  <span className="text-xs font-medium uppercase" style={{ color: "var(--courier-secondary, #f97316)" }}>Revenus origine</span>
                  <span className="mt-1 text-xl font-bold teliya-monetary">{money(origin)}</span>
                </div>
                <div className="flex flex-col rounded-xl border border-gray-100 bg-gray-50/80 p-4 shadow-sm">
                  <Truck className="mb-1 h-5 w-5 text-gray-500" aria-hidden />
                  <span className="text-xs font-medium uppercase text-gray-500">Envois livrés</span>
                  <span className="mt-1 text-2xl font-bold text-gray-800">{delivered.length}</span>
                </div>
                <div
                  className="flex flex-col rounded-xl border p-4 shadow-sm"
                  style={{ borderColor: "color-mix(in srgb, var(--courier-secondary, #f97316) 25%, transparent)", backgroundColor: "color-mix(in srgb, var(--courier-secondary, #f97316) 5%, transparent)" }}
                >
                  <Wallet className="mb-1 h-5 w-5" style={{ color: "var(--courier-secondary, #f97316)" }} aria-hidden />
                  <span className="text-xs font-medium uppercase" style={{ color: "var(--courier-secondary, #f97316)" }}>Revenus destination</span>
                  <span className="mt-1 text-xl font-bold teliya-monetary">{money(dest)}</span>
                </div>
              </div>
              <div
                className="flex flex-wrap items-center gap-2 rounded-xl border-2 py-3 px-4"
                style={{ borderColor: "var(--courier-primary, #ea580c)", backgroundColor: "color-mix(in srgb, var(--courier-primary, #ea580c) 5%, transparent)" }}
              >
                <span className="font-semibold text-gray-900">Total global :</span>
                <span className="text-xl font-bold teliya-monetary">{money(total)}</span>
                {session.status === "VALIDATED" && session.expectedAmount != null && (
                  <span className="ml-2 text-sm text-gray-600">
                    Attendu : <span className="teliya-monetary">{money(session.expectedAmount)}</span> — Différence : <span className="teliya-monetary">{money((session.validatedAmount ?? 0) - (session.expectedAmount ?? 0))}</span>
                  </span>
                )}
              </div>
              {created.length > 0 && (
                <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-100 font-semibold text-gray-700">
                        <th className="p-3 text-left">N° Envoi</th>
                        <th className="p-3 text-left">Agent</th>
                        <th className="p-3 text-left">Nature</th>
                        <th className="p-3 text-left">Destinataire</th>
                        <th className="p-3 text-right">Statut</th>
                        <th className="p-3 text-right">Frais transport</th>
                        <th className="p-3 text-right">Montant dest.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {created.slice(0, 20).map((s, i) => (
                        <tr key={s.shipmentId} className={`border-b ${i % 2 === 1 ? "bg-gray-50" : ""}`}>
                          <td className="p-3 font-mono">{s.shipmentNumber ?? s.shipmentId}</td>
                          <td className="p-3">{s.agentCode ?? "—"}</td>
                          <td className="p-3">{s.nature ?? "—"}</td>
                          <td className="p-3">{s.receiver?.name ?? "—"}</td>
                          <td className="p-3 text-right">{s.currentStatus}</td>
                          <td className="p-3 text-right teliya-monetary">{money(s.transportFee ?? 0)}</td>
                          <td className="p-3 text-right teliya-monetary">{money(s.destinationCollectedAmount ?? 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {created.length > 20 && <p className="mt-1 text-gray-500">… et {created.length - 20} autres</p>}
                </div>
              )}
            </section>
          );
        })}
      </div>
      {sessions.length === 0 && (
        <div className="rounded-xl border border-gray-200/80 bg-white p-8 text-center text-gray-500 shadow-sm">
          Aucune session courrier.
        </div>
      )}
    </div>
  );
}
