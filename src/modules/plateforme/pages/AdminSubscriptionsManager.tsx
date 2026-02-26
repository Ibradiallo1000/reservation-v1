/**
 * Teliya SaaS – Admin Subscription Manager
 *
 * Full manual subscription control panel for platform admins.
 * Works entirely via Firestore direct writes — no Cloud Function dependency.
 * 100% Spark-compatible.
 */
import React, { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  addDoc,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import {
  Building2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Search,
  Link2,
  Copy,
  UserPlus,
} from "lucide-react";
import {
  STATUS_LABELS,
  STATUS_COLORS,
} from "@/shared/subscription/lifecycle";
import type { SubscriptionStatus } from "@/shared/subscription/types";
import { formatCurrency, getCurrencySymbol } from "@/shared/utils/formatCurrency";

/* ====================================================================
   TYPES
==================================================================== */
interface CompanyRow {
  id: string;
  nom: string;
  plan: string;
  subscriptionStatus: SubscriptionStatus;
  nextBillingDate?: Date | null;
  lastPaymentAt?: Date | null;
  digitalFeePercent: number;
  totalDigitalRevenueGenerated: number;
  totalDigitalFeesCollected: number;
  totalPaymentsReceived: number;
  trialEndsAt?: Date | null;
  graceUntil?: Date | null;
}

/* ====================================================================
   CONSTANTS
==================================================================== */
const BILLING_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

const toDate = (v: unknown): Date | null => {
  if (!v) return null;
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  return null;
};

const fmtDate = (d: Date | null | undefined): string => {
  if (!d) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
};

const ALL_STATUSES: SubscriptionStatus[] = ["trial", "active", "grace", "restricted", "suspended"];

/* ====================================================================
   COMPONENT
==================================================================== */
export default function AdminSubscriptionsManager() {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Payment form
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<"invoice" | "mobile_money">("mobile_money");

  // Edit digital fee
  const [editFeeId, setEditFeeId] = useState<string | null>(null);
  const [editFeeValue, setEditFeeValue] = useState<number>(0);

  // Pending invitations
  const [invitations, setInvitations] = useState<Array<{
    id: string;
    email: string;
    role: string;
    fullName?: string;
    companyId?: string;
    token?: string;
    status: string;
  }>>([]);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  /* ── Load companies ── */
  const loadCompanies = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "companies"), orderBy("nom", "asc"));
      const snap = await getDocs(q);
      const rows: CompanyRow[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          nom: (data.nom as string) || d.id,
          plan: (data.plan as string) || "—",
          subscriptionStatus: (data.subscriptionStatus as SubscriptionStatus) || "active",
          nextBillingDate: toDate(data.nextBillingDate),
          lastPaymentAt: toDate(data.lastPaymentAt),
          digitalFeePercent: Number(data.digitalFeePercent) || 0,
          totalDigitalRevenueGenerated: Number(data.totalDigitalRevenueGenerated) || 0,
          totalDigitalFeesCollected: Number(data.totalDigitalFeesCollected) || 0,
          totalPaymentsReceived: Number(data.totalPaymentsReceived) || 0,
          trialEndsAt: toDate(data.trialEndsAt),
          graceUntil: toDate(data.graceUntil),
        };
      });
      setCompanies(rows);

      // Load pending invitations
      const invQ = query(
        collection(db, "invitations"),
        where("status", "==", "pending"),
      );
      const invSnap = await getDocs(invQ);
      setInvitations(
        invSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            email: (data.email as string) || "",
            role: (data.role as string) || "",
            fullName: data.fullName as string | undefined,
            companyId: data.companyId as string | undefined,
            token: data.token as string | undefined,
            status: (data.status as string) || "pending",
          };
        }),
      );
    } catch (err) {
      setMessage({ type: "error", text: "Erreur lors du chargement des compagnies." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompanies();
  }, []);

  const filtered = companies.filter((c) =>
    c.nom.toLowerCase().includes(search.toLowerCase()) ||
    c.plan.toLowerCase().includes(search.toLowerCase()),
  );

  /* ── Set subscription status ── */
  const setStatus = async (companyId: string, newStatus: SubscriptionStatus) => {
    setSaving(companyId);
    try {
      const now = Timestamp.now();
      const update: Record<string, unknown> = {
        subscriptionStatus: newStatus,
        "subscription.status": newStatus,
        updatedAt: serverTimestamp(),
      };

      if (newStatus === "grace") {
        const graceEnd = Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
        update.graceUntil = graceEnd;
        update["subscription.gracePeriodEnd"] = graceEnd;
      }

      if (newStatus === "active") {
        update.status = "actif";
      }

      await updateDoc(doc(db, "companies", companyId), update);
      setMessage({ type: "success", text: `Statut mis à jour : ${STATUS_LABELS[newStatus]}` });
      await loadCompanies();
    } catch (err) {
      setMessage({ type: "error", text: "Erreur lors de la mise à jour du statut." });
    } finally {
      setSaving(null);
    }
  };

  /* ── Extend billing period ── */
  const extendBilling = async (companyId: string) => {
    setSaving(companyId);
    try {
      const now = new Date();
      const newEnd = Timestamp.fromDate(new Date(now.getTime() + BILLING_PERIOD_MS));
      await updateDoc(doc(db, "companies", companyId), {
        nextBillingDate: newEnd,
        "subscription.currentPeriodEnd": newEnd,
        "subscription.nextBillingDate": newEnd,
        updatedAt: serverTimestamp(),
      });
      setMessage({ type: "success", text: "Période de facturation prolongée de 30 jours." });
      await loadCompanies();
    } catch (err) {
      setMessage({ type: "error", text: "Erreur lors de l'extension." });
    } finally {
      setSaving(null);
    }
  };

  /* ── Record payment ── */
  const recordPayment = async (companyId: string) => {
    if (paymentAmount <= 0) {
      setMessage({ type: "error", text: "Le montant doit être positif." });
      return;
    }
    setSaving(companyId);
    try {
      const now = Timestamp.now();
      const periodEnd = Timestamp.fromDate(new Date(Date.now() + BILLING_PERIOD_MS));

      // 1. Create payment document
      await addDoc(collection(db, "companies", companyId, "payments"), {
        amount: paymentAmount,
        method: paymentMethod,
        periodCoveredStart: now,
        periodCoveredEnd: periodEnd,
        createdAt: serverTimestamp(),
        status: "validated",
        validatedBy: "admin_manual",
        validatedAt: serverTimestamp(),
      });

      // 2. Update company
      const companyRef = doc(db, "companies", companyId);
      const currentCompany = companies.find((c) => c.id === companyId);
      const newTotal = (currentCompany?.totalPaymentsReceived ?? 0) + paymentAmount;

      await updateDoc(companyRef, {
        subscriptionStatus: "active",
        "subscription.status": "active",
        lastPaymentAt: now,
        nextBillingDate: periodEnd,
        "subscription.currentPeriodStart": now,
        "subscription.currentPeriodEnd": periodEnd,
        "subscription.lastPaymentAt": now,
        "subscription.nextBillingDate": periodEnd,
        totalPaymentsReceived: newTotal,
        status: "actif",
        updatedAt: serverTimestamp(),
      });

      setMessage({ type: "success", text: `Paiement de ${formatCurrency(paymentAmount)} enregistré.` });
      setPaymentAmount(0);
      await loadCompanies();
    } catch (err) {
      setMessage({ type: "error", text: "Erreur lors de l'enregistrement du paiement." });
    } finally {
      setSaving(null);
    }
  };

  /* ── Save digital fee ── */
  const saveDigitalFee = async (companyId: string) => {
    setSaving(companyId);
    try {
      await updateDoc(doc(db, "companies", companyId), {
        digitalFeePercent: editFeeValue,
        updatedAt: serverTimestamp(),
      });
      setMessage({ type: "success", text: `Frais digital mis à jour : ${editFeeValue}%` });
      setEditFeeId(null);
      await loadCompanies();
    } catch (err) {
      setMessage({ type: "error", text: "Erreur lors de la mise à jour du frais digital." });
    } finally {
      setSaving(null);
    }
  };

  /* ── Status badge ── */
  const StatusBadge: React.FC<{ status: SubscriptionStatus }> = ({ status }) => {
    const colors = STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700";
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors}`}>
        {STATUS_LABELS[status] ?? status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion des abonnements</h1>
          <p className="text-sm text-gray-500 mt-1">
            Contrôle manuel du cycle de vie des abonnements — {companies.length} compagnie{companies.length > 1 ? "s" : ""}
          </p>
        </div>
        <Button variant="secondary" onClick={loadCompanies} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${
            message.type === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-700"
          }`}
        >
          {message.type === "error" ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          {message.text}
          <button className="ml-auto text-xs underline" onClick={() => setMessage(null)}>Fermer</button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          className="w-full rounded-lg border border-gray-300 bg-white pl-10 pr-4 py-2 text-sm focus:border-[var(--btn-primary,#FF6600)] focus:outline-none focus:ring-2 focus:ring-[var(--btn-primary,#FF6600)]/20"
          placeholder="Rechercher par nom ou plan..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-orange-500" />
              Invitations en attente ({invitations.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {invitations.map((inv) => {
                const companyName = companies.find((c) => c.id === inv.companyId)?.nom || inv.companyId || "Plateforme";
                const activationUrl = inv.token
                  ? `${window.location.origin}/accept-invitation/${inv.token}`
                  : null;
                const isCopied = copiedToken === inv.id;

                return (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-4 py-3 bg-gray-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 text-sm truncate">{inv.email}</span>
                        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                          {inv.role === "company_ceo" ? "CEO" : inv.role}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {inv.fullName && <span>{inv.fullName} · </span>}
                        {companyName}
                      </p>
                    </div>
                    {activationUrl ? (
                      <Button
                        variant={isCopied ? "primary" : "secondary"}
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(activationUrl);
                          setCopiedToken(inv.id);
                          setMessage({ type: "success", text: `Lien d'activation copié pour ${inv.email}` });
                          setTimeout(() => setCopiedToken(null), 3000);
                        }}
                      >
                        {isCopied ? (
                          <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Copié !</>
                        ) : (
                          <><Copy className="h-3.5 w-3.5 mr-1" /> Copier le lien</>
                        )}
                      </Button>
                    ) : (
                      <span className="text-xs text-amber-600 flex items-center gap-1">
                        <AlertCircle className="h-3.5 w-3.5" /> Pas de token
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Company list */}
      <div className="space-y-3">
        {filtered.map((c) => {
          const isExpanded = expandedId === c.id;
          const isSaving = saving === c.id;

          return (
            <Card key={c.id}>
              {/* Summary row */}
              <button
                type="button"
                className="w-full text-left p-4 flex items-center gap-4 hover:bg-gray-50 transition rounded-xl"
                onClick={() => setExpandedId(isExpanded ? null : c.id)}
              >
                <Building2 className="h-5 w-5 text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 truncate">{c.nom}</span>
                    <StatusBadge status={c.subscriptionStatus} />
                    <span className="text-xs text-gray-400">{c.plan}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-500">
                    <span>Frais digital : <strong className="text-gray-700">{c.digitalFeePercent}%</strong></span>
                    <span>Prochaine fact. : <strong className="text-gray-700">{fmtDate(c.nextBillingDate)}</strong></span>
                    <span>Paiements : <strong className="text-gray-700">{formatCurrency(c.totalPaymentsReceived)}</strong></span>
                  </div>
                </div>
                {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <CardContent className="border-t border-gray-100 space-y-5">
                  {/* KPI Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-gray-500">Revenus digitaux</p>
                      <p className="text-lg font-bold">{formatCurrency(c.totalDigitalRevenueGenerated)}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-gray-500">Frais collectés</p>
                      <p className="text-lg font-bold text-[var(--btn-primary,#FF6600)]">{formatCurrency(c.totalDigitalFeesCollected)}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-gray-500">Paiements reçus</p>
                      <p className="text-lg font-bold text-green-600">{formatCurrency(c.totalPaymentsReceived)}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-gray-500">Dernier paiement</p>
                      <p className="text-sm font-semibold">{fmtDate(c.lastPaymentAt)}</p>
                    </div>
                  </div>

                  {/* Status Controls */}
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Changer le statut</p>
                    <div className="flex flex-wrap gap-2">
                      {ALL_STATUSES.map((s) => (
                        <Button
                          key={s}
                          variant={c.subscriptionStatus === s ? "primary" : "secondary"}
                          size="sm"
                          disabled={isSaving || c.subscriptionStatus === s}
                          onClick={() => setStatus(c.id, s)}
                        >
                          {STATUS_LABELS[s]}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Extend billing */}
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Facturation</p>
                    <Button variant="secondary" size="sm" disabled={isSaving} onClick={() => extendBilling(c.id)}>
                      Prolonger +30 jours
                    </Button>
                    {c.trialEndsAt && (
                      <p className="text-xs text-gray-500 mt-1">Fin d'essai : {fmtDate(c.trialEndsAt)}</p>
                    )}
                    {c.graceUntil && (
                      <p className="text-xs text-amber-600 mt-1">Fin de grâce : {fmtDate(c.graceUntil)}</p>
                    )}
                  </div>

                  {/* Edit digital fee */}
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Frais canal digital</p>
                    {editFeeId === c.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          className="w-24 rounded-lg border px-3 py-1.5 text-sm"
                          value={editFeeValue}
                          onChange={(e) => setEditFeeValue(Number(e.target.value))}
                        />
                        <span className="text-sm text-gray-500">%</span>
                        <Button variant="primary" size="sm" disabled={isSaving} onClick={() => saveDigitalFee(c.id)}>
                          Sauver
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setEditFeeId(null)}>
                          Annuler
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => { setEditFeeId(c.id); setEditFeeValue(c.digitalFeePercent); }}
                      >
                        {c.digitalFeePercent}% — Modifier
                      </Button>
                    )}
                  </div>

                  {/* Record payment */}
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                    <p className="text-sm font-medium text-green-800 mb-3 flex items-center gap-1">
                      <DollarSign className="h-4 w-4" /> Enregistrer un paiement
                    </p>
                    <div className="flex flex-wrap items-end gap-3">
                      <div>
                        <label className="text-xs text-gray-600">Montant ({getCurrencySymbol()})</label>
                        <input
                          type="number"
                          min="0"
                          className="block w-40 rounded-lg border px-3 py-1.5 text-sm mt-1"
                          value={paymentAmount || ""}
                          onChange={(e) => setPaymentAmount(Number(e.target.value))}
                          placeholder="40000"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">Méthode</label>
                        <select
                          className="block rounded-lg border px-3 py-1.5 text-sm mt-1"
                          value={paymentMethod}
                          onChange={(e) => setPaymentMethod(e.target.value as "invoice" | "mobile_money")}
                        >
                          <option value="mobile_money">Mobile Money</option>
                          <option value="invoice">Facture</option>
                        </select>
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={isSaving || paymentAmount <= 0}
                        onClick={() => recordPayment(c.id)}
                      >
                        Enregistrer
                      </Button>
                    </div>
                    <p className="text-xs text-green-700 mt-2">
                      Cela active automatiquement l'abonnement et prolonge de 30 jours.
                    </p>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}

        {filtered.length === 0 && !loading && (
          <p className="text-sm text-gray-500 text-center py-8">Aucune compagnie trouvée.</p>
        )}
      </div>
    </div>
  );
}
