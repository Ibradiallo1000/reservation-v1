// src/components/company/PlanCard.tsx
import React from "react";

type Props = {
  plan: string;
  maxAgences: number;
  maxUsers: number;
  usedAgences: number;
  usedUsers: number;
  guichetEnabled: boolean;
  onlineBookingEnabled: boolean;
  minimumMonthly: number;
  commissionOnline: number; // décimal (0.02)
  feeGuichet: number;
};
export default function PlanCard(p: Props) {
  return (
    <div className="bg-white rounded-xl border shadow-sm p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Mon plan</h3>
        <span className="px-2 py-1 rounded text-white bg-orange-600 text-xs uppercase">
          {p.plan}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>Agences : {p.usedAgences}/{p.maxAgences}</div>
        <div>Utilisateurs : {p.usedUsers}/{p.maxUsers}</div>
        <div>Guichet : {p.guichetEnabled ? "Activé" : "Désactivé"}</div>
        <div>En ligne : {p.onlineBookingEnabled ? "Activé" : "Désactivé"}</div>
        <div>Min. mensuel : {p.minimumMonthly.toLocaleString("fr-FR")} FCFA</div>
        <div>Commission en ligne : {(p.commissionOnline*100).toFixed(1)}%</div>
        <div>Frais guichet : {p.feeGuichet.toLocaleString("fr-FR")} FCFA</div>
      </div>
      <div className="mt-4">
        <a href="/admin/abonnements" className="text-orange-600 text-sm hover:underline">
          Voir les offres / upgrader →
        </a>
      </div>
    </div>
  );
}
