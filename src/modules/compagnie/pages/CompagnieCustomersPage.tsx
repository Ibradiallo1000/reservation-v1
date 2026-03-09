// src/modules/compagnie/pages/CompagnieCustomersPage.tsx
// CRM — Liste des clients (par téléphone), recherche, total trajets / dépenses.
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { StandardLayoutWrapper, PageHeader } from "@/ui";
import { listCustomers } from "@/modules/compagnie/crm/customerService";
import type { CustomerDocWithId } from "@/modules/compagnie/crm/customerTypes";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { Search, Users, ChevronRight } from "lucide-react";

const CompagnieCustomersPage: React.FC = () => {
  const { user, company } = useAuth();
  const { companyId: companyIdFromUrl } = useParams();
  const companyId = companyIdFromUrl ?? user?.companyId ?? "";
  const theme = useCompanyTheme(company);
  const formatCurrency = useFormatCurrency();
  const navigate = useNavigate();

  const [customers, setCustomers] = useState<CustomerDocWithId[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setLoading(true);
    listCustomers(companyId, { search: search || undefined, limitCount: 500 })
      .then((list) => {
        if (!cancelled) setCustomers(list);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, search]);

  const basePath = companyId ? `/compagnie/${companyId}` : "/compagnie";

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Clients"
        subtitle="Historique des voyages et dépenses par client"
        icon={Users}
        primaryColorVar={theme?.colors?.primary ? `var(--teliya-primary)` : undefined}
      />

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="search"
              placeholder="Rechercher par nom ou téléphone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-offset-0 dark:bg-gray-800 dark:border-gray-600"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-gray-500">Chargement...</div>
        ) : customers.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            Aucun client trouvé. Les clients sont créés à partir des réservations (guichet ou en ligne).
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Nom</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Téléphone</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Trajets</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total dépensé</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Dernier trajet</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                {customers.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                    onClick={() => navigate(`${basePath}/customers/${c.id}`)}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{c.name || "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{c.phone || "—"}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{c.totalTrips ?? 0}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-white">
                      {formatCurrency(c.totalSpent ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{c.lastTripDate || "—"}</td>
                    <td className="px-4 py-3">
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </StandardLayoutWrapper>
  );
};

export default CompagnieCustomersPage;
