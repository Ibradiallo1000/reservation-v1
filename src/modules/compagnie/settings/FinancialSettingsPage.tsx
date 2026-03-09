import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { SectionCard, ActionButton } from "@/ui";
import { Settings, Save, RefreshCw, Lock } from "lucide-react";
import {
  getExpenseApprovalThresholds,
  updateExpenseApprovalThresholds,
  type ExpenseApprovalThresholds,
} from "./expenseApprovalSettings";

export default function FinancialSettingsPage() {
  const { user } = useAuth() as any;
  const { companyId: companyIdFromUrl } = useParams<{ companyId: string }>();
  const companyId = companyIdFromUrl ?? user?.companyId ?? "";

  const role = String(user?.role ?? "");
  const canEdit = role === "admin_compagnie";
  const isReadOnlyRole = role === "company_accountant" || role === "financial_director";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thresholds, setThresholds] = useState<ExpenseApprovalThresholds>({
    agencyManagerLimit: 100000,
    accountantLimit: 500000,
    ceoLimit: 500000,
  });

  const readOnly = !canEdit;
  const subtitle = useMemo(() => {
    if (canEdit) return "Vous pouvez modifier les seuils d'approbation des dépenses.";
    if (isReadOnlyRole) return "Lecture seule pour ce rôle.";
    return "Accès en lecture seule.";
  }, [canEdit, isReadOnlyRole]);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getExpenseApprovalThresholds(companyId);
        if (!cancelled) setThresholds(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erreur de chargement.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const updateField = (key: keyof ExpenseApprovalThresholds, value: string) => {
    const n = Number(value);
    setThresholds((prev) => ({
      ...prev,
      [key]: Number.isFinite(n) && n >= 0 ? n : 0,
    }));
  };

  const handleSave = async () => {
    if (!companyId || !canEdit) return;
    setSaving(true);
    setError(null);
    try {
      await updateExpenseApprovalThresholds(companyId, thresholds, user?.uid ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  if (!companyId) {
    return <div className="p-6 text-gray-500">Compagnie introuvable.</div>;
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Seuil de dépenses"
        icon={Settings}
        help={subtitle}
        right={
          canEdit ? (
            <ActionButton onClick={handleSave} disabled={saving || loading}>
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Enregistrer
            </ActionButton>
          ) : (
            <span className="inline-flex items-center gap-2 text-sm text-gray-600">
              <Lock className="h-4 w-4" />
              Lecture seule
            </span>
          )
        }
      >
        {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

        {loading ? (
          <div className="py-8 text-center text-gray-500">Chargement...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Seuil chef d'agence
              </label>
              <input
                type="number"
                min={0}
                value={thresholds.agencyManagerLimit}
                onChange={(e) => updateField("agencyManagerLimit", e.target.value)}
                disabled={readOnly}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Seuil chef comptable
              </label>
              <input
                type="number"
                min={0}
                value={thresholds.accountantLimit}
                onChange={(e) => updateField("accountantLimit", e.target.value)}
                disabled={readOnly}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Seuil CEO
              </label>
              <input
                type="number"
                min={0}
                value={thresholds.ceoLimit}
                onChange={(e) => updateField("ceoLimit", e.target.value)}
                disabled={readOnly}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-100"
              />
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
