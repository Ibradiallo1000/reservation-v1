/**
 * Teliya SaaS – Platform Revenue Dashboard
 *
 * Aggregated view of platform SaaS revenue:
 *   - Total digital revenue generated (all companies)
 *   - Total digital fees collected (Teliya's revenue)
 *   - Total subscription payments received
 *   - Top companies by revenue and fees
 *
 * 100% Spark-compatible — reads Firestore directly.
 */
import React, { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import {
  TrendingUp,
  DollarSign,
  Building2,
  RefreshCw,
  ArrowUpRight,
  CreditCard,
  Percent,
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
interface CompanyRevenue {
  id: string;
  nom: string;
  plan: string;
  subscriptionStatus: SubscriptionStatus;
  digitalFeePercent: number;
  totalDigitalRevenueGenerated: number;
  totalDigitalFeesCollected: number;
  totalPaymentsReceived: number;
}

interface PlatformTotals {
  totalRevenue: number;
  totalFees: number;
  totalPayments: number;
  companiesCount: number;
  activeCount: number;
  trialCount: number;
  graceCount: number;
  restrictedCount: number;
  suspendedCount: number;
}

/* ====================================================================
   COMPONENT
==================================================================== */
export default function AdminRevenueDashboard() {
  const [companies, setCompanies] = useState<CompanyRevenue[]>([]);
  const [totals, setTotals] = useState<PlatformTotals>({
    totalRevenue: 0, totalFees: 0, totalPayments: 0,
    companiesCount: 0, activeCount: 0, trialCount: 0,
    graceCount: 0, restrictedCount: 0, suspendedCount: 0,
  });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "companies"), orderBy("nom", "asc"));
      const snap = await getDocs(q);

      const rows: CompanyRevenue[] = [];
      let tRev = 0, tFees = 0, tPay = 0;
      let active = 0, trial = 0, grace = 0, restricted = 0, suspended = 0;

      snap.docs.forEach((d) => {
        const data = d.data();
        const rev = Number(data.totalDigitalRevenueGenerated) || 0;
        const fees = Number(data.totalDigitalFeesCollected) || 0;
        const pay = Number(data.totalPaymentsReceived) || 0;
        const status = (data.subscriptionStatus as SubscriptionStatus) || "active";

        tRev += rev;
        tFees += fees;
        tPay += pay;

        if (status === "active") active++;
        else if (status === "trial") trial++;
        else if (status === "grace") grace++;
        else if (status === "restricted") restricted++;
        else if (status === "suspended") suspended++;

        rows.push({
          id: d.id,
          nom: (data.nom as string) || d.id,
          plan: (data.plan as string) || "—",
          subscriptionStatus: status,
          digitalFeePercent: Number(data.digitalFeePercent) || 0,
          totalDigitalRevenueGenerated: rev,
          totalDigitalFeesCollected: fees,
          totalPaymentsReceived: pay,
        });
      });

      setCompanies(rows);
      setTotals({
        totalRevenue: tRev, totalFees: tFees, totalPayments: tPay,
        companiesCount: rows.length, activeCount: active, trialCount: trial,
        graceCount: grace, restrictedCount: restricted, suspendedCount: suspended,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const topByRevenue = [...companies]
    .sort((a, b) => b.totalDigitalRevenueGenerated - a.totalDigitalRevenueGenerated)
    .slice(0, 5);

  const topByFees = [...companies]
    .sort((a, b) => b.totalDigitalFeesCollected - a.totalDigitalFeesCollected)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Revenus Teliya</h1>
          <p className="text-sm text-gray-500 mt-1">
            Vue consolidée des revenus de la plateforme
          </p>
        </div>
        <Button variant="secondary" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Revenus digitaux</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(totals.totalRevenue)}</p>
                <p className="text-xs text-gray-400">{getCurrencySymbol()} (toutes compagnies)</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Frais Teliya collectés</p>
                <p className="text-2xl font-bold mt-1 text-[var(--btn-primary,#FF6600)]">{formatCurrency(totals.totalFees)}</p>
                <p className="text-xs text-gray-400">{getCurrencySymbol()} (revenus plateforme)</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                <Percent className="h-5 w-5 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Paiements abonnements</p>
                <p className="text-2xl font-bold mt-1 text-green-600">{formatCurrency(totals.totalPayments)}</p>
                <p className="text-xs text-gray-400">{getCurrencySymbol()} (mensualités)</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Compagnies</p>
                <p className="text-2xl font-bold mt-1">{totals.companiesCount}</p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <span className="text-xs text-green-600">{totals.activeCount} actives</span>
                  {totals.trialCount > 0 && <span className="text-xs text-blue-600">{totals.trialCount} essai</span>}
                  {totals.graceCount > 0 && <span className="text-xs text-amber-600">{totals.graceCount} grâce</span>}
                  {totals.restrictedCount > 0 && <span className="text-xs text-red-600">{totals.restrictedCount} restreintes</span>}
                </div>
              </div>
              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-gray-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top companies */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top by digital revenue */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowUpRight className="h-4 w-4 text-blue-600" />
              Top 5 — Revenus digitaux
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topByRevenue.length === 0 ? (
              <p className="text-sm text-gray-500">Aucune donnée</p>
            ) : (
              <div className="space-y-3">
                {topByRevenue.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.nom}</p>
                      <p className="text-xs text-gray-500">{c.plan} — {c.digitalFeePercent}%</p>
                    </div>
                    <span className="text-sm font-bold text-gray-900 shrink-0">
                      {formatCurrency(c.totalDigitalRevenueGenerated)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top by fees collected */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="h-4 w-4 text-orange-600" />
              Top 5 — Frais Teliya collectés
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topByFees.length === 0 ? (
              <p className="text-sm text-gray-500">Aucune donnée</p>
            ) : (
              <div className="space-y-3">
                {topByFees.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 text-xs font-bold flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.nom}</p>
                      <p className="text-xs text-gray-500">{c.plan} — {c.digitalFeePercent}%</p>
                    </div>
                    <span className="text-sm font-bold text-[var(--btn-primary,#FF6600)] shrink-0">
                      {formatCurrency(c.totalDigitalFeesCollected)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Full company revenue table */}
      <Card>
        <CardHeader>
          <CardTitle>Détail par compagnie</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-4 font-medium">Compagnie</th>
                  <th className="py-2 pr-4 font-medium">Plan</th>
                  <th className="py-2 pr-4 font-medium">Statut</th>
                  <th className="py-2 pr-4 font-medium text-right">Frais %</th>
                  <th className="py-2 pr-4 font-medium text-right">Rev. digital</th>
                  <th className="py-2 pr-4 font-medium text-right">Frais collectés</th>
                  <th className="py-2 font-medium text-right">Paiements</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => {
                  const colors = STATUS_COLORS[c.subscriptionStatus] ?? "";
                  return (
                    <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2.5 pr-4 font-medium text-gray-900">{c.nom}</td>
                      <td className="py-2.5 pr-4 text-gray-600">{c.plan}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors}`}>
                          {STATUS_LABELS[c.subscriptionStatus]}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-right text-[var(--btn-primary,#FF6600)] font-medium">{c.digitalFeePercent}%</td>
                      <td className="py-2.5 pr-4 text-right">{formatCurrency(c.totalDigitalRevenueGenerated)}</td>
                      <td className="py-2.5 pr-4 text-right font-medium text-[var(--btn-primary,#FF6600)]">{formatCurrency(c.totalDigitalFeesCollected)}</td>
                      <td className="py-2.5 text-right font-medium text-green-600">{formatCurrency(c.totalPaymentsReceived)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
