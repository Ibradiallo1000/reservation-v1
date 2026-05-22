// src/pages/chef-comptable/Parametres.tsx
import React, { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { SectionCard } from '@/ui';
import { useCurrencySymbol } from '@/shared/currency/CurrencyContext';
import { AlertTriangle, Bell, CheckCircle, RefreshCw, Save } from 'lucide-react';

const Parametres: React.FC = () => {
  const currencySymbol = useCurrencySymbol();
  const [settings, setSettings] = useState({
    financialAlertsEnabled: true,
    lowCashThreshold: 500000,
    criticalGapThreshold: 50000,
  });
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success'>('idle');

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2500);
    }, 600);
  };

  const updateAmount = (key: 'lowCashThreshold' | 'criticalGapThreshold', value: string) => {
    setSettings((prev) => ({
      ...prev,
      [key]: Math.max(0, Number(value) || 0),
    }));
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="Alertes financieres"
        icon={Bell}
        right={
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2"
          >
            {saving ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : saveStatus === 'success' ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? 'Enregistrement...' : saveStatus === 'success' ? 'Enregistre' : 'Enregistrer'}
          </Button>
        }
      >
        <div className="space-y-4">
          {saveStatus === 'success' ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Parametres d'alerte enregistres.
            </div>
          ) : (
            <p className="text-sm text-gray-600">
              Reglages minimums pour surveiller les flux et signaler les anomalies financieres.
            </p>
          )}

          <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 p-4">
            <div className="min-w-0">
              <div className="font-medium text-gray-900">Activer les alertes</div>
              <div className="mt-1 text-sm text-gray-600">
                Signaler automatiquement les caisses faibles et les ecarts critiques.
              </div>
            </div>
            <button
              type="button"
              aria-pressed={settings.financialAlertsEnabled}
              onClick={() =>
                setSettings((prev) => ({
                  ...prev,
                  financialAlertsEnabled: !prev.financialAlertsEnabled,
                }))
              }
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
                settings.financialAlertsEnabled ? 'bg-[var(--btn-primary,#2563eb)]' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition ${
                  settings.financialAlertsEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block rounded-lg border border-gray-200 p-4">
              <span className="flex items-center gap-2 font-medium text-gray-900">
                <Bell className="h-4 w-4 text-gray-500" />
                Seuil caisse faible
              </span>
              <span className="mt-1 block text-sm text-gray-600">
                Alerte si une caisse descend sous ce montant ({currencySymbol}).
              </span>
              <input
                type="number"
                min={0}
                value={settings.lowCashThreshold}
                onChange={(e) => updateAmount('lowCashThreshold', e.target.value)}
                disabled={!settings.financialAlertsEnabled}
                className="mt-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500"
              />
            </label>

            <label className="block rounded-lg border border-gray-200 p-4">
              <span className="flex items-center gap-2 font-medium text-gray-900">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Seuil ecart critique
              </span>
              <span className="mt-1 block text-sm text-gray-600">
                Alerte si l'ecart comptable atteint ce montant ({currencySymbol}).
              </span>
              <input
                type="number"
                min={0}
                value={settings.criticalGapThreshold}
                onChange={(e) => updateAmount('criticalGapThreshold', e.target.value)}
                disabled={!settings.financialAlertsEnabled}
                className="mt-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500"
              />
            </label>
          </div>
        </div>
      </SectionCard>
    </div>
  );
};

export default Parametres;
