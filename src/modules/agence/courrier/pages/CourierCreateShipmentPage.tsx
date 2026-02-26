// CourierCreateShipmentPage — UX: searchable agency, phone autocomplete, frequent senders/destinations, responsive.

import React, { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebaseConfig";
import { getDocs, onSnapshot, query, where } from "firebase/firestore";
import { collection } from "firebase/firestore";
import { courierSessionsRef } from "@/modules/logistics/domain/courierSessionPaths";
import { shipmentsRef } from "@/modules/logistics/domain/firestorePaths";
import { createShipment } from "@/modules/logistics/services/createShipment";
import { makeShortCode } from "@/utils/brand";
import { recordLogisticsLedgerEntry } from "@/modules/logistics/services/recordLogisticsLedgerEntry";
import type { CourierSession } from "@/modules/logistics/domain/courierSession.types";
import type { Shipment } from "@/modules/logistics/domain/shipment.types";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import type { Company } from "@/types/companyTypes";
import { Package, Loader2, AlertCircle, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import CourierReceipt from "../components/CourierReceipt";
import CourierPackageLabel from "../components/CourierPackageLabel";
import CourierPageHeader from "../components/CourierPageHeader";
import AgencySearchSelect from "../components/AgencySearchSelect";

const MAX_PHONE_SUGGESTIONS = 5;
const RECENT_SHIPMENTS_LIMIT = 50;
const FREQUENT_SENDERS_TOP = 3;
const FREQUENT_DESTINATIONS_TOP = 3;

export default function CourierCreateShipmentPage() {
  const { user, company } = useAuth() as {
    user: { uid: string; companyId?: string; agencyId?: string; displayName?: string; agencyNom?: string };
    company: { nom?: string; logoUrl?: string; code?: string } | null;
  };
  const money = useFormatCurrency();
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const agentId = user?.uid ?? "";
  const agentName = user?.displayName ?? "Agent";
  const agencyName = user?.agencyNom ?? "Agence";
  const companyName = company?.nom ?? "Compagnie";
  const companyLogoUrl = company?.logoUrl ?? undefined;
  const theme = useCompanyTheme(company as Company | null);
  const primaryColor = theme?.colors?.primary ?? "#ea580c";
  const secondaryColor = theme?.colors?.secondary ?? "#f97316";
  const agentCode = (user as { staffCode?: string; codeCourt?: string; code?: string })?.staffCode
    ?? (user as { codeCourt?: string; code?: string })?.codeCourt
    ?? (user as { code?: string })?.code
    ?? "COUR";

  const [session, setSession] = useState<CourierSession | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [agencies, setAgencies] = useState<{ id: string; nomAgence?: string; nom?: string; code?: string }[]>([]);
  const [destinationAgencyId, setDestinationAgencyId] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [nature, setNature] = useState("");
  const [declaredValue, setDeclaredValue] = useState("");
  const [transportFee, setTransportFee] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCreatedShipment, setLastCreatedShipment] = useState<Shipment | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [showLabel, setShowLabel] = useState(false);
  const [recentShipments, setRecentShipments] = useState<Shipment[]>([]);

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
        const data = d.data() as CourierSession;
        if (data.status === "ACTIVE" || data.status === "PENDING") {
          setSessionId(d.id);
          setSession({ ...data, sessionId: d.id });
        } else {
          setSessionId(null);
          setSession(null);
        }
      } else {
        setSessionId(null);
        setSession(null);
      }
    });
    return () => unsub();
  }, [companyId, agencyId, agentId]);

  useEffect(() => {
    if (!companyId) return;
    getDocs(collection(db, "companies", companyId, "agences")).then((snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as { id: string; nomAgence?: string; nom?: string; code?: string }));
      setAgencies(list);
      if (list.length > 0 && !destinationAgencyId) setDestinationAgencyId(list.find((a) => a.id !== agencyId)?.id ?? list[0].id);
    });
  }, [companyId, agencyId]);

  useEffect(() => {
    if (!companyId || !agencyId) return;
    const q = query(
      shipmentsRef(db, companyId),
      where("originAgencyId", "==", agencyId),
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => d.data() as Shipment);
      const sorted = list.sort((a, b) => {
        const aT = (a.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
        const bT = (b.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
        return bT - aT;
      });
      setRecentShipments(sorted.slice(0, RECENT_SHIPMENTS_LIMIT));
    });
    return () => unsub();
  }, [companyId, agencyId]);

  const frequentSenders = useMemo(() => {
    const byPhone = new Map<string, { name: string; count: number }>();
    recentShipments.slice(0, 10).forEach((s) => {
      const phone = (s.sender?.phone ?? "").trim();
      if (!phone) return;
      const name = (s.sender?.name ?? "").trim() || phone;
      const cur = byPhone.get(phone);
      if (!cur) byPhone.set(phone, { name, count: 1 });
      else { cur.count += 1; if (s.sender?.name?.trim()) cur.name = s.sender.name.trim(); }
    });
    return [...byPhone.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, FREQUENT_SENDERS_TOP)
      .map(([phone, { name }]) => ({ phone, name }));
  }, [recentShipments]);

  const frequentDestinations = useMemo(() => {
    const byAgency = new Map<string, number>();
    recentShipments.slice(0, 20).forEach((s) => {
      const id = s.destinationAgencyId ?? "";
      if (!id) return;
      byAgency.set(id, (byAgency.get(id) ?? 0) + 1);
    });
    return [...byAgency.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, FREQUENT_DESTINATIONS_TOP)
      .map(([id]) => id);
  }, [recentShipments]);

  const senderPhoneSuggestions = useMemo(() => {
    const prefix = senderPhone.trim().toLowerCase();
    if (prefix.length < 2) return [];
    const seen = new Set<string>();
    const out: { phone: string; name: string }[] = [];
    for (const s of recentShipments) {
      const ph = (s.sender?.phone ?? "").trim();
      if (!ph || !ph.toLowerCase().startsWith(prefix) || seen.has(ph)) continue;
      seen.add(ph);
      out.push({ phone: ph, name: (s.sender?.name ?? "").trim() || ph });
      if (out.length >= MAX_PHONE_SUGGESTIONS) break;
    }
    return out;
  }, [recentShipments, senderPhone]);

  const receiverPhoneSuggestions = useMemo(() => {
    const prefix = receiverPhone.trim().toLowerCase();
    if (prefix.length < 2) return [];
    const seen = new Set<string>();
    const out: { phone: string; name: string }[] = [];
    for (const s of recentShipments) {
      const ph = (s.receiver?.phone ?? "").trim();
      if (!ph || !ph.toLowerCase().startsWith(prefix) || seen.has(ph)) continue;
      seen.add(ph);
      out.push({ phone: ph, name: (s.receiver?.name ?? "").trim() || ph });
      if (out.length >= MAX_PHONE_SUGGESTIONS) break;
    }
    return out;
  }, [recentShipments, receiverPhone]);

  const total = (() => {
    const fee = Number(transportFee);
    return Number.isNaN(fee) || fee < 0 ? 0 : fee;
  })();

  const canSubmit =
    session?.status === "ACTIVE" &&
    sessionId &&
    senderName.trim() !== "" &&
    senderPhone.trim() !== "" &&
    receiverName.trim() !== "" &&
    receiverPhone.trim() !== "" &&
    nature.trim() !== "" &&
    declaredValue.trim() !== "" &&
    !Number.isNaN(Number(declaredValue)) &&
    Number(declaredValue) >= 0 &&
    transportFee.trim() !== "" &&
    !Number.isNaN(Number(transportFee)) &&
    Number(transportFee) >= 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !sessionId) return;
    setError(null);
    setSubmitting(true);
    try {
      const fee = Number(transportFee);
      const decl = Number(declaredValue);
      const originAgency = agencies.find((a) => a.id === agencyId);
      const companyCode = makeShortCode(company?.nom, company?.code);
      const agencyCode = makeShortCode(originAgency?.nomAgence ?? originAgency?.nom, originAgency?.code);

      const { shipmentId, shipmentNumber } = await createShipment({
        companyId,
        originAgencyId: agencyId,
        destinationAgencyId: destinationAgencyId || agencyId,
        sender: { name: senderName.trim(), phone: senderPhone.trim() },
        receiver: { name: receiverName.trim(), phone: receiverPhone.trim() },
        nature: nature.trim(),
        declaredValue: Number.isNaN(decl) ? 0 : decl,
        insuranceRate: 0,
        insuranceAmount: 0,
        transportFee: fee,
        paymentType: "ORIGIN",
        paymentStatus: fee > 0 ? "PAID_ORIGIN" : "UNPAID",
        createdBy: agentId,
        sessionId,
        agentCode,
        companyCode,
        agencyCode,
      });

      await recordLogisticsLedgerEntry({
        companyId,
        sessionId,
        shipmentId,
        agencyId,
        agentId,
        type: "TRANSPORT_FEE",
        amount: fee,
      });

      setLastCreatedShipment({
        shipmentId,
        shipmentNumber,
        originAgencyId: agencyId,
        destinationAgencyId: destinationAgencyId || agencyId,
        sender: { name: senderName.trim(), phone: senderPhone.trim() },
        receiver: { name: receiverName.trim(), phone: receiverPhone.trim() },
        nature: nature.trim(),
        declaredValue: Number.isNaN(decl) ? 0 : decl,
        insuranceRate: 0,
        insuranceAmount: 0,
        transportFee: fee,
        paymentType: "ORIGIN",
        paymentStatus: fee > 0 ? "PAID_ORIGIN" : "UNPAID",
        currentStatus: "CREATED",
        currentAgencyId: agencyId,
        createdAt: new Date(),
        createdBy: agentId,
        sessionId,
        agentCode,
      });
      setSenderName("");
      setSenderPhone("");
      setReceiverName("");
      setReceiverPhone("");
      setNature("");
      setDeclaredValue("");
      setTransportFee("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur création envoi");
    } finally {
      setSubmitting(false);
    }
  };

  const destinationAgencyName = (id: string) => agencies.find((a) => a.id === id)?.nomAgence ?? agencies.find((a) => a.id === id)?.nom ?? id;

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-6">
      <CourierPageHeader
        icon={Package}
        title="Nouvel Envoi"
        primaryColor={primaryColor}
        right={
          <Link
            to="/agence/courrier"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition-colors duration-200"
            style={{ borderColor: "var(--courier-primary, #ea580c)", color: "var(--courier-primary, #ea580c)" }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = "var(--courier-primary, #ea580c)";
              e.currentTarget.style.color = "#fff";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = "";
              e.currentTarget.style.color = "var(--courier-primary, #ea580c)";
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            Courrier
          </Link>
        }
      />

      {!session && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm">
          Aucune session active. Ouvrez une session depuis Courrier et attendez son activation par le comptable.
        </div>
      )}

      {session?.status === "PENDING" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm">
          Session en attente d&apos;activation par le comptable.
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-800 border border-red-200">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="ml-auto underline min-h-[44px]">Fermer</button>
        </div>
      )}

      {session?.status === "ACTIVE" && (
        <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-gray-200/80 bg-white p-5 shadow-sm sm:p-6" style={{ ["--focus-ring" as string]: secondaryColor }}>
          {frequentSenders.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">Expéditeurs fréquents</p>
              <div className="flex flex-wrap gap-2">
                {frequentSenders.map(({ phone, name }) => (
                  <button
                    key={phone}
                    type="button"
                    onClick={() => { setSenderPhone(phone); setSenderName(name); }}
                    className="min-h-[44px] rounded-lg border px-3 py-2 text-sm transition-colors duration-200"
                    style={{ borderColor: "var(--courier-primary, #ea580c)", color: "var(--courier-primary, #ea580c)" }}
                    onMouseOver={(e) => { e.currentTarget.style.backgroundColor = "var(--courier-primary, #ea580c)"; e.currentTarget.style.color = "#fff"; }}
                    onMouseOut={(e) => { e.currentTarget.style.backgroundColor = ""; e.currentTarget.style.color = "var(--courier-primary, #ea580c)"; }}
                  >
                    {name || phone}
                  </button>
                ))}
              </div>
            </div>
          )}

          <section className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
            <h2 className="mb-3 font-semibold" style={{ color: "var(--courier-primary, #ea580c)" }}>Expéditeur</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Nom <span className="text-red-500">*</span></label>
                <input required value={senderName} onChange={(e) => setSenderName(e.target.value)} className="min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2.5 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:ring-offset-0" placeholder="Nom expéditeur" />
              </div>
              <div className="relative">
                <label className="mb-1 block text-sm font-medium text-gray-700">Téléphone <span className="text-red-500">*</span></label>
                <input required type="tel" value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} className="min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2.5 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:ring-offset-0" placeholder="Tél. expéditeur" />
                {senderPhoneSuggestions.length > 0 && (
                  <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border bg-white py-1 shadow-lg">
                    {senderPhoneSuggestions.map(({ phone, name }) => (
                      <li key={phone}>
                        <button type="button" className="w-full px-3 py-2.5 text-left text-sm min-h-[44px] hover:opacity-90" style={{ backgroundColor: "color-mix(in srgb, var(--courier-primary, #ea580c) 5%, transparent)" }} onMouseDown={(e) => { e.preventDefault(); setSenderPhone(phone); setSenderName(name || senderName); }}>
                          {name || phone} — {phone}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
            <h2 className="mb-3 font-semibold" style={{ color: "var(--courier-primary, #ea580c)" }}>Destinataire</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom <span className="text-red-500">*</span></label>
                <input required value={receiverName} onChange={(e) => setReceiverName(e.target.value)} className="min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2.5 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:ring-offset-0" placeholder="Nom destinataire" />
              </div>
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone <span className="text-red-500">*</span></label>
                <input required type="tel" value={receiverPhone} onChange={(e) => setReceiverPhone(e.target.value)} className="min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2.5 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:ring-offset-0" placeholder="Tél. destinataire" />
                {receiverPhoneSuggestions.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full rounded-lg border bg-white shadow-lg py-1 max-h-48 overflow-auto">
                    {receiverPhoneSuggestions.map(({ phone, name }) => (
                      <li key={phone}>
                        <button type="button" className="w-full px-3 py-2.5 text-left text-sm min-h-[44px] hover:opacity-90" style={{ backgroundColor: "color-mix(in srgb, var(--courier-primary, #ea580c) 5%, transparent)" }} onMouseDown={(e) => { e.preventDefault(); setReceiverPhone(phone); setReceiverName(name || receiverName); }}>
                          {name || phone} — {phone}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
            {frequentDestinations.length > 0 && (
              <div className="mb-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">Destinations fréquentes</p>
                <div className="flex flex-wrap gap-2">
                  {frequentDestinations.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setDestinationAgencyId(id)}
                      className={`min-h-[44px] rounded-lg border px-3 py-2 text-sm transition-colors duration-200 ${destinationAgencyId === id ? "font-medium text-white" : ""}`}
                      style={destinationAgencyId === id ? { backgroundColor: "var(--courier-primary, #ea580c)", borderColor: "var(--courier-primary, #ea580c)" } : { borderColor: "var(--courier-primary, #ea580c)", color: "var(--courier-primary, #ea580c)" }}
                      onMouseOver={(e) => { if (destinationAgencyId !== id) { e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--courier-primary, #ea580c) 10%, transparent)"; } }}
                      onMouseOut={(e) => { if (destinationAgencyId !== id) e.currentTarget.style.backgroundColor = ""; }}
                    >
                      {destinationAgencyName(id)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <label className="mb-1 block text-sm font-medium text-gray-700">Agence de destination</label>
            <AgencySearchSelect
              options={agencies}
              value={destinationAgencyId}
              onChange={setDestinationAgencyId}
              placeholder="Rechercher une agence…"
              aria-label="Agence de destination"
            />
          </section>

          <section className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
            <h2 className="mb-3 font-semibold" style={{ color: "var(--courier-primary, #ea580c)" }}>Colis</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Nature <span className="text-red-500">*</span></label>
                <input required value={nature} onChange={(e) => setNature(e.target.value)} className="min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2.5 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:ring-offset-0" placeholder="Ex: Documents, Colis" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Valeur déclarée (FCFA) <span className="text-red-500">*</span></label>
                  <input required type="number" min="0" step="1" value={declaredValue} onChange={(e) => setDeclaredValue(e.target.value)} className="min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2.5 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:ring-offset-0" placeholder="0" />
                  <p className="mt-1 text-xs text-gray-500">N&apos;affecte pas le total.</p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Frais de transport (FCFA) <span className="text-red-500">*</span></label>
                  <input required type="number" min="0" step="1" value={transportFee} onChange={(e) => setTransportFee(e.target.value)} className="min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2.5 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:ring-offset-0" placeholder="0" />
                </div>
              </div>
            </div>
          </section>

          <div className="flex flex-col gap-4 rounded-xl border-2 bg-gray-50/80 p-5 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--courier-primary, #ea580c)" }}>
            <div>
              <span className="text-sm font-medium uppercase tracking-wider text-gray-600">Total à payer</span>
              <p className="mt-1 text-2xl font-bold teliya-monetary">{money(total)}</p>
            </div>
            <button type="submit" disabled={!canSubmit || submitting} className="w-full min-h-[48px] rounded-lg px-4 py-2.5 text-white transition-colors duration-200 disabled:opacity-50 sm:w-auto inline-flex items-center justify-center gap-2" style={{ backgroundColor: "var(--courier-primary, #ea580c)" }} onMouseOver={(e) => { if (canSubmit && !submitting) e.currentTarget.style.backgroundColor = "var(--courier-secondary, #f97316)"; }} onMouseOut={(e) => { e.currentTarget.style.backgroundColor = "var(--courier-primary, #ea580c)"; }}>
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              Créer l&apos;envoi
            </button>
          </div>
        </form>
      )}

      {lastCreatedShipment && (
        <div className="space-y-4 rounded-xl border border-gray-200/80 bg-white p-5 shadow-sm sm:p-6">
          <p className="font-medium text-green-700">Envoi créé : {lastCreatedShipment.shipmentNumber ?? lastCreatedShipment.shipmentId}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setShowReceipt(true)} className="min-h-[44px] rounded-lg px-4 py-2.5 text-sm text-white transition-colors duration-200" style={{ backgroundColor: "var(--courier-primary, #ea580c)" }} onMouseOver={(e) => { e.currentTarget.style.backgroundColor = "var(--courier-secondary, #f97316)"; }} onMouseOut={(e) => { e.currentTarget.style.backgroundColor = "var(--courier-primary, #ea580c)"; }}>Imprimer reçu</button>
            <button type="button" onClick={() => setShowLabel(true)} className="min-h-[44px] rounded-lg border px-4 py-2.5 text-sm transition-colors duration-200" style={{ borderColor: "var(--courier-primary, #ea580c)", color: "var(--courier-primary, #ea580c)" }} onMouseOver={(e) => { e.currentTarget.style.backgroundColor = "var(--courier-primary, #ea580c)"; e.currentTarget.style.color = "#fff"; }} onMouseOut={(e) => { e.currentTarget.style.backgroundColor = ""; e.currentTarget.style.color = "var(--courier-primary, #ea580c)"; }}>Imprimer étiquette</button>
            <button type="button" onClick={() => { setLastCreatedShipment(null); setShowReceipt(false); setShowLabel(false); }} className="min-h-[44px] rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-colors duration-200 hover:bg-gray-50">Fermer</button>
          </div>
        </div>
      )}

      {lastCreatedShipment && showReceipt && (
        <CourierReceipt shipment={lastCreatedShipment} companyName={companyName} companyLogoUrl={companyLogoUrl} agencyName={agencyName} agentName={agentName} agentCode={agentCode} onClose={() => setShowReceipt(false)} />
      )}
      {lastCreatedShipment && showLabel && (
        <CourierPackageLabel shipment={lastCreatedShipment} destinationAgencyName={destinationAgencyName(lastCreatedShipment.destinationAgencyId)} originAgencyName={agencyName} onClose={() => setShowLabel(false)} />
      )}
    </div>
  );
}
