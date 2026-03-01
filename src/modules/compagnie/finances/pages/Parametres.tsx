// src/pages/chef-comptable/Parametres.tsx
import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import useCompanyTheme from '@/shared/hooks/useCompanyTheme';
import { Button } from '@/shared/ui/button';
import { SectionCard } from '@/ui';
import { useCurrencySymbol } from '@/shared/currency/CurrencyContext';
import { getCurrencySymbol } from '@/shared/utils/formatCurrency';
import {
  Settings,
  Save,
  Bell,
  Shield,
  FileText,
  CreditCard,
  AlertTriangle,
  RefreshCw,
  Eye,
  EyeOff,
  CheckCircle,
  Calendar
} from 'lucide-react';

const Parametres: React.FC = () => {
  const { company } = useAuth() as any;
  const theme = useCompanyTheme(company) || { primary: '#2563eb', secondary: '#3b82f6' };
  const currencySymbol = useCurrencySymbol();
  
  const [settings, setSettings] = useState({
    // Alertes et notifications
    emailNotifications: true,
    pushNotifications: true,
    lowBalanceAlert: true,
    alertThreshold: 500000,
    
    // Validation automatique
    autoValidation: false,
    validationDelay: 2, // heures
    minAmountForValidation: 10000,
    
    // Sécurité
    twoFactorAuth: false,
    sessionTimeout: 30, // minutes
    ipRestriction: false,
    
    // Affichage
    defaultCurrency: 'XOF',
    dateFormat: 'DD/MM/YYYY',
    showAmountsInThousands: true,
    
    // Rapports
    autoReportGeneration: true,
    reportFrequency: 'weekly',
    reportEmail: '',
    keepReportsFor: 12 // mois
  });

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSave = () => {
    setSaving(true);
    // Simulation d'enregistrement
    setTimeout(() => {
      setSaving(false);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }, 1000);
  };

  const toggleSetting = (key: keyof typeof settings) => {
    if (typeof settings[key] === 'boolean') {
      setSettings(prev => ({ ...prev, [key]: !prev[key] }));
    }
  };

  const updateSetting = (key: keyof typeof settings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const SettingToggle: React.FC<{
    label: string;
    description: string;
    checked: boolean;
    onChange: () => void;
    icon: React.ReactNode;
  }> = ({ label, description, checked, onChange, icon }) => (
    <div className="flex items-start justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50/50">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
          {icon}
        </div>
        <div>
          <div className="font-medium text-gray-900">{label}</div>
          <div className="text-sm text-gray-600 mt-1">{description}</div>
        </div>
      </div>
      <button
        onClick={onChange}
        className={`relative inline-flex h-6 w-11 items-center rounded-full ${
          checked ? 'bg-[var(--btn-primary,#FF6600)]' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );

  const SettingInput: React.FC<{
    label: string;
    description: string;
    value: any;
    onChange: (value: any) => void;
    type?: 'text' | 'number' | 'select';
    options?: { value: string; label: string }[];
    icon: React.ReactNode;
  }> = ({ label, description, value, onChange, type = 'text', options, icon }) => (
    <div className="p-4 border border-gray-200 rounded-lg">
      <div className="flex items-start gap-3 mb-3">
        <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
          {icon}
        </div>
        <div className="flex-1">
          <div className="font-medium text-gray-900">{label}</div>
          <div className="text-sm text-gray-600 mt-1">{description}</div>
        </div>
      </div>
      
      {type === 'select' && options ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:border-transparent"
          style={{ outlineColor: theme.primary }}
        >
          {options.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:border-transparent"
          style={{ outlineColor: theme.primary }}
        />
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <SectionCard
        title="Paramètres comptables"
        icon={Settings}
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
            {saving ? 'Enregistrement...' : saveStatus === 'success' ? 'Enregistré !' : 'Enregistrer'}
          </Button>
        }
      >
        <p className="text-sm text-gray-600 mb-4">Configuration de l'espace chef comptable</p>
        {saveStatus === 'success' && (
          <div className="mb-4 p-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700">
            Les paramètres ont été enregistrés avec succès.
          </div>
        )}
      </SectionCard>

      <div className="space-y-6">
        <SectionCard title="Alertes et notifications" icon={Bell}>
          <p className="text-sm text-gray-600 mb-4">Configurez les notifications système</p>
          <div className="space-y-3">
            <SettingToggle
              label="Notifications par email"
              description="Recevoir les alertes importantes par email"
              checked={settings.emailNotifications}
              onChange={() => toggleSetting('emailNotifications')}
              icon={<Bell className="h-5 w-5" />}
            />
            
            <SettingToggle
              label="Notifications push"
              description="Alerte en temps réel dans le navigateur"
              checked={settings.pushNotifications}
              onChange={() => toggleSetting('pushNotifications')}
              icon={<AlertTriangle className="h-5 w-5" />}
            />
            
            <SettingToggle
              label="Alerte solde bas"
              description="Recevoir une alerte quand le solde d'une caisse est bas"
              checked={settings.lowBalanceAlert}
              onChange={() => toggleSetting('lowBalanceAlert')}
              icon={<CreditCard className="h-5 w-5" />}
            />
            
            <SettingInput
              label="Seuil d'alerte solde bas"
              description={`Montant minimum déclenchant une alerte (${currencySymbol})`}
              value={settings.alertThreshold}
              onChange={(value) => updateSetting('alertThreshold', value)}
              type="number"
              icon={<AlertTriangle className="h-5 w-5" />}
            />
          </div>
        </SectionCard>

        <SectionCard title="Validation automatique" icon={CheckCircle}>
          <p className="text-sm text-gray-600 mb-4">Paramètres de validation des réservations</p>
          <div className="space-y-3">
            <SettingToggle
              label="Validation automatique"
              description="Valider automatiquement les réservations avec preuve"
              checked={settings.autoValidation}
              onChange={() => toggleSetting('autoValidation')}
              icon={<RefreshCw className="h-5 w-5" />}
            />
            
            <SettingInput
              label="Délai de validation"
              description="Heures avant validation automatique"
              value={settings.validationDelay}
              onChange={(value) => updateSetting('validationDelay', value)}
              type="number"
              icon={<Eye className="h-5 w-5" />}
            />
            
            <SettingInput
              label="Montant minimum"
              description={`Montant minimum pour validation auto (${currencySymbol})`}
              value={settings.minAmountForValidation}
              onChange={(value) => updateSetting('minAmountForValidation', value)}
              type="number"
              icon={<CreditCard className="h-5 w-5" />}
            />
          </div>
        </SectionCard>

        <SectionCard title="Sécurité" icon={Shield}>
          <p className="text-sm text-gray-600 mb-4">Paramètres de sécurité de l'espace</p>
          <div className="space-y-3">
            <SettingToggle
              label="Authentification à deux facteurs"
              description="Exiger une validation supplémentaire pour la connexion"
              checked={settings.twoFactorAuth}
              onChange={() => toggleSetting('twoFactorAuth')}
              icon={<Shield className="h-5 w-5" />}
            />
            
            <SettingInput
              label="Délai de session"
              description="Minutes avant déconnexion automatique"
              value={settings.sessionTimeout}
              onChange={(value) => updateSetting('sessionTimeout', value)}
              type="number"
              icon={<EyeOff className="h-5 w-5" />}
            />
            
            <SettingToggle
              label="Restriction d'adresse IP"
              description="Limiter l'accès à certaines adresses IP"
              checked={settings.ipRestriction}
              onChange={() => toggleSetting('ipRestriction')}
              icon={<AlertTriangle className="h-5 w-5" />}
            />
          </div>
        </SectionCard>

        <SectionCard title="Affichage" icon={Eye}>
          <p className="text-sm text-gray-600 mb-4">Préférences d'affichage des données</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SettingInput
              label="Devise par défaut"
              description="Devise d'affichage des montants"
              value={settings.defaultCurrency}
              onChange={(value) => updateSetting('defaultCurrency', value)}
              type="select"
              options={[
                { value: 'XOF', label: `${getCurrencySymbol('XOF')} / XOF (Franc CFA)` },
                { value: 'EUR', label: 'EUR (Euro)' },
                { value: 'USD', label: 'USD (Dollar)' }
              ]}
              icon={<CreditCard className="h-5 w-5" />}
            />
            
            <SettingInput
              label="Format de date"
              description="Format d'affichage des dates"
              value={settings.dateFormat}
              onChange={(value) => updateSetting('dateFormat', value)}
              type="select"
              options={[
                { value: 'DD/MM/YYYY', label: 'JJ/MM/AAAA (français)' },
                { value: 'MM/DD/YYYY', label: 'MM/JJ/AAAA (américain)' },
                { value: 'YYYY-MM-DD', label: 'AAAA-MM-JJ (international)' }
              ]}
              icon={<Calendar className="h-5 w-5" />}
            />
            
            <div className="md:col-span-2">
              <SettingToggle
                label="Montants en milliers"
                description="Afficher les montants en milliers (ex: 15K au lieu de 15000)"
                checked={settings.showAmountsInThousands}
                onChange={() => toggleSetting('showAmountsInThousands')}
                icon={<FileText className="h-5 w-5" />}
              />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Rapports" icon={FileText}>
          <p className="text-sm text-gray-600 mb-4">Configuration des rapports automatiques</p>
          <div className="space-y-3">
            <SettingToggle
              label="Génération automatique"
              description="Générer automatiquement les rapports périodiques"
              checked={settings.autoReportGeneration}
              onChange={() => toggleSetting('autoReportGeneration')}
              icon={<RefreshCw className="h-5 w-5" />}
            />
            
            <SettingInput
              label="Fréquence des rapports"
              description="Fréquence de génération des rapports"
              value={settings.reportFrequency}
              onChange={(value) => updateSetting('reportFrequency', value)}
              type="select"
              options={[
                { value: 'daily', label: 'Quotidien' },
                { value: 'weekly', label: 'Hebdomadaire' },
                { value: 'monthly', label: 'Mensuel' },
                { value: 'quarterly', label: 'Trimestriel' }
              ]}
              icon={<Calendar className="h-5 w-5" />}
            />
            
            <SettingInput
              label="Email des rapports"
              description="Adresse email pour recevoir les rapports"
              value={settings.reportEmail}
              onChange={(value) => updateSetting('reportEmail', value)}
              type="text"
              icon={<Bell className="h-5 w-5" />}
            />
            
            <SettingInput
              label="Conservation des rapports"
              description="Nombre de mois de conservation"
              value={settings.keepReportsFor}
              onChange={(value) => updateSetting('keepReportsFor', value)}
              type="number"
              icon={<Shield className="h-5 w-5" />}
            />
          </div>
        </SectionCard>
      </div>
    </div>
  );
};

export default Parametres;