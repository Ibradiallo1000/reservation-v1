// src/modules/compagnie/pages/CompagnieCustomerProfilePage.tsx
// CRM — Fiche client : infos, historique des réservations, revenus générés.
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { StandardLayoutWrapper, PageHeader } from "@/ui";
import {
  getCustomer,
  listReservationsForCustomer,
  type CustomerReservationRow,
} from "@/modules/compagnie/crm/customerService";
import type { CustomerDocWithId } from "@/modules/compagnie/crm/customerTypes";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { ArrowLeft, User, Calendar, Mail, Phone } from "lucide-react";
import { formatDateLongFr } from "@/utils/dateFmt";

const CompagnieCustomerProfilePage: React.FC = () => {
  const { user, company } = useAuth();
  const { companyId: companyIdFromUrl, customerId } = useParams<{ companyId: string; customerId: string }>();
  const companyId = companyIdFromUrl ?? user?.companyId ?? "";
  const theme = useCompanyTheme(company);
  const formatCurrency = useFormatCurrency();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState<CustomerDocWithId | null>(null);
  const [reservations, setReservations] = useState<CustomerReservationRow[]>([]);
  const [agencyNames, setAgencyNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId || !customerId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const [cust, agencesSnap] = await Promise.all([
          getCustomer(companyId, customerId),
          getDocs(collection(db, `companies/${companyId}/agences`)),
        ]);
        if (cancelled) return;
        setCustomer(cust);
        const agencyIds = agencesSnap.docs.map((d) => d.id);
        const names: Record<string, string> = {};
        agencesSnap.docs.forEach((d) => {
          const data = d.data() as { nomAgence?: string; nom?: string; ville?: string };
          names[d.id] = data.nomAgence || data.nom || data.ville || d.id;
        });
        setAgencyNames(names);

        const rows = await listReservationsForCustomer(companyId, customerId, agencyIds);
        if (!cancelled) setReservations(rows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId, customerId]);

  const basePath = companyId ? `/compagnie/${companyId}` : "/compagnie";

  if (loading && !customer) {
    return (
      <StandardLayoutWrapper>
        <div className="py-12 text-center text-gray-500">Chargement...</div>
      </StandardLayoutWrapper>
    );
  }

  if (!customer) {
    return (
      <StandardLayoutWrapper>
        <div className="py-12 text-center text-gray-500">Client introuvable.</div>
        <button
          type="button"
          onClick={() => navigate(`${basePath}/customers`)}
          className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
        >
          Retour à la liste des clients
        </button>
      </StandardLayoutWrapper>
    );
  }

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title={customer.name || "Sans nom"}
        subtitle="Fiche client"
        icon={User}
        primaryColorVar={theme?.colors?.primary ? `var(--teliya-primary)` : undefined}
        right={
          <button
            type="button"
            onClick={() => navigate(`${basePath}/customers`)}
            className="inline-flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour aux clients
          </button>
        }
      />

      <div className="space-y-6">
        {/* Infos personnelles */}
        <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-900">
          <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Informations</h2>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2 text-gray-900 dark:text-white">
              <Phone className="h-4 w-4 text-gray-400" />
              <span>{customer.phone || "—"}</span>
            </div>
            {customer.email && (
              <div className="flex items-center gap-2 text-gray-900 dark:text-white">
                <Mail className="h-4 w-4 text-gray-400" />
                <span>{customer.email}</span>
              </div>
            )}
          </div>
        </section>

        {/* Revenus générés */}
        <section className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-900">
          <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Revenus générés</h2>
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total dépensé</p>
              <p className="text-xl font-semibold text-gray-900 dark:text-white">
                {formatCurrency(customer.totalSpent ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Nombre de trajets</p>
              <p className="text-xl font-semibold text-gray-900 dark:text-white">{customer.totalTrips ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Dernier trajet</p>
              <p className="text-lg text-gray-900 dark:text-white">{customer.lastTripDate || "—"}</p>
            </div>
          </div>
        </section>

        {/* Historique des réservations */}
        <section className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900">
          <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 p-4 pb-0">Historique des réservations</h2>
          {reservations.length === 0 ? (
            <p className="p-4 text-gray-500 text-sm">Aucune réservation trouvée (les anciennes réservations sans téléphone normalisé ne sont pas affichées).</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Trajet</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Agence</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Montant</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {reservations.map((r) => (
                    <tr key={`${r.agencyId}-${r.id}`}>
                      <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">
                        {r.date && r.heure ? `${r.date} ${r.heure}` : r.createdAt ? formatDateLongFr(r.createdAt.toDate?.() ?? new Date()) : "—"}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                        {[r.depart, r.arrivee].filter(Boolean).join(" → ") || "—"}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{agencyNames[r.agencyId] ?? r.agencyId}</td>
                      <td className="px-4 py-2 text-sm text-right font-medium text-gray-900 dark:text-white">
                        {r.montant != null ? formatCurrency(r.montant) : "—"}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">{r.statut || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </StandardLayoutWrapper>
  );
};

export default CompagnieCustomerProfilePage;
