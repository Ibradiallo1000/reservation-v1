// src/components/company/PlanCard.tsx
// Updated for dual-revenue model
import React from "react";
import { CheckCircle2 } from "lucide-react";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";

type Props = {
  plan: string;
  maxAgences: number;
  maxUsers: number;
  usedAgences: number;
  usedUsers: number;
  guichetEnabled: boolean;
  onlineBookingEnabled: boolean;
  minimumMonthly: number;
  digitalFeePercent?: number;
  feeGuichet: number;
  supportLevel?: string;
};

export default function PlanCard(p: Props) {
  const money = useFormatCurrency();
  const digitalFee = p.digitalFeePercent ?? 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Mon plan</h3>
        <span className="px-2 py-1 rounded text-white bg-[var(--btn-primary,#FF6600)] text-xs uppercase">
          {p.plan}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>Agences : {p.usedAgences}/{p.maxAgences === 0 ? "∞" : p.maxAgences}</div>
        <div>Utilisateurs : {p.usedUsers}/{p.maxUsers}</div>
        <div className="col-span-2 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
            <CheckCircle2 className="h-3 w-3" /> Page publique
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
            <CheckCircle2 className="h-3 w-3" /> Réservation en ligne
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
            <CheckCircle2 className="h-3 w-3" /> Guichet
          </span>
        </div>
        <div>Min. mensuel : {money(p.minimumMonthly)}</div>
        <div>
          Frais canal digital :{" "}
          <span className="text-[var(--btn-primary,#FF6600)] font-medium">{digitalFee.toFixed(1)}%</span>
        </div>
        <div>Frais guichet : {money(p.feeGuichet)}</div>
        {p.supportLevel && (
          <div>Support : <span className="capitalize font-medium">{p.supportLevel}</span></div>
        )}
      </div>
      <div className="mt-4">
        <a href="/admin/abonnements" className="text-[var(--btn-primary,#FF6600)] text-sm hover:underline">
          Voir les offres / upgrader →
        </a>
      </div>
    </div>
  );
}
