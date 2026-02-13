// src/pages/chef-comptable/Parametres.tsx
import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import useCompanyTheme from '@/shared/hooks/useCompanyTheme';
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
    defaultCurrency: 'FCFA',
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
    <div className="flex items-start justify-between p-4 border border-gray-200 rounded-xl hover:bg-gray-50/50">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
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
          checked ? 'bg-blue-600' : 'bg-gray-300'
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
    <div className="p-4 border border-gray-200 rounded-xl">
      <div className="flex items-start gap-3 mb-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
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
    <div className="space-y-6 sm:space-y-8">
      {/* ================= EN-TÊTE ================= */}
      <div className="rounded-2xl border border-gray-200 shadow-sm p-6 bg-gradient-to-r from-white to-gray-50/50">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-slate-50 to-gray-50 flex items-center justify-center">
              <Settings className="h-6 w-6 text-gray-600" />
            </div>
            <div>
              <div className="text-xl font-bold text-gray-900">Paramètres comptables</div>
              <div className="text-sm text-gray-600">Configuration de l'espace chef comptable</div>
            </div>
          </div>
          
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white font-medium shadow-md disabled:opacity-50"
            style={{ 
              background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})`,
            }}
          >
            {saving ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : saveStatus === 'success' ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? 'Enregistrement...' : saveStatus === 'success' ? 'Enregistré !' : 'Enregistrer'}
          </button>
        </div>
        
        {saveStatus === 'success' && (
          <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
            <div className="text-emerald-700 text-sm">Les paramètres ont été enregistrés avec succès.</div>
          </div>
        )}
      </div>

      {/* ================= SECTIONS ================= */}
      <div className="space-y-6">
        {/* ALERTES ET NOTIFICATIONS */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
              <Bell className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <div className="text-lg font-bold text-gray-900">Alertes et notifications</div>
              <div className="text-sm text-gray-600">Configurez les notifications système</div>
            </div>
          </div>
          
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
              description="Montant minimum déclenchant une alerte (FCFA)"
              value={settings.alertThreshold}
              onChange={(value) => updateSetting('alertThreshold', value)}
              type="number"
              icon={<AlertTriangle className="h-5 w-5" />}
            />
          </div>
        </div>

        {/* VALIDATION AUTOMATIQUE */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-50 to-green-50 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <div className="text-lg font-bold text-gray-900">Validation automatique</div>
              <div className="text-sm text-gray-600">Paramètres de validation des réservations</div>
            </div>
          </div>
          
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
              description="Montant minimum pour validation auto (FCFA)"
              value={settings.minAmountForValidation}
              onChange={(value) => updateSetting('minAmountForValidation', value)}
              type="number"
              icon={<CreditCard className="h-5 w-5" />}
            />
          </div>
        </div>

        {/* SÉCURITÉ */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center">
              <Shield className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <div className="text-lg font-bold text-gray-900">Sécurité</div>
              <div className="text-sm text-gray-600">Paramètres de sécurité de l'espace</div>
            </div>
          </div>
          
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
        </div>

        {/* AFFICHAGE */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-50 to-pink-50 flex items-center justify-center">
              <Eye className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <div className="text-lg font-bold text-gray-900">Affichage</div>
              <div className="text-sm text-gray-600">Préférences d'affichage des données</div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SettingInput
              label="Devise par défaut"
              description="Devise d'affichage des montants"
              value={settings.defaultCurrency}
              onChange={(value) => updateSetting('defaultCurrency', value)}
              type="select"
              options={[
                { value: 'FCFA', label: 'FCFA (Franc CFA)' },
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
        </div>

        {/* RAPPORTS */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-50 to-blue-50 flex items-center justify-center">
              <FileText className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <div className="text-lg font-bold text-gray-900">Rapports</div>
              <div className="text-sm text-gray-600">Configuration des rapports automatiques</div>
            </div>
          </div>
          
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
        </div>
      </div>
    </div>
  );
};

export default Parametres;