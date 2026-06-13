// =============================================
// src/pages/CompanyPaymentSettingsPage.tsx
// =============================================
import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  setDoc,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';

import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { StandardLayoutWrapper, PageHeader, SectionCard } from '@/ui';
import useCompanyTheme from '@/shared/hooks/useCompanyTheme';
import { CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';


type PaymentMethodGlobal = {
  id?: string;
  name: string;
  logoUrl: string;
  countryCode?: string;
  active?: boolean;
  type?: string; // e.g. mobile_money, cash, card, ...
  ussdTemplate?: string;
  instructions?: string;
  requiresMerchantCode?: boolean;
  requiresPhoneNumber?: boolean;
};

type PaymentConfigByCompany = {
  companyId: string;
  methodId: string;
  isEnabled: boolean;
  merchantCode?: string;
  phoneNumber?: string;
  updatedAt?: Timestamp;
};

// Temporary mapping used only for legacy payloads where `company.pays` may contain the *name* (e.g. "Mali")
// Instead of the ISO code (e.g. "ML").
const WEST_AFRICA_COUNTRIES = [
  { name: 'Mali', code: 'ML' },
  { name: 'Sénégal', code: 'SN' },
  { name: "Côte d’Ivoire", code: 'CI' },
  { name: 'Burkina Faso', code: 'BF' },
  { name: 'Guinée', code: 'GN' },
  { name: 'Niger', code: 'NE' },
  { name: 'Bénin', code: 'BJ' },
  { name: 'Togo', code: 'TG' },
  { name: 'Ghana', code: 'GH' },
  { name: 'Nigeria', code: 'NG' },
];

function resolveCompanyCountryCode(company: any): string {
  // 1) Source of truth: ISO countryCode stored on the company
  const cc1 = company?.countryCode;
  if (typeof cc1 === 'string' && cc1.trim() !== '') return cc1.trim();

  // 2) Legacy fallback: derive ISO from `company.pays` which may contain either the ISO code or the country name
  const p1 = company?.pays;
  if (typeof p1 === 'string' && p1.trim() !== '') {
    const raw = p1.trim();
    // If already an ISO code ("ML") return it
    const direct = WEST_AFRICA_COUNTRIES.find((c) => c.code === raw);
    if (direct) return direct.code;

    // Otherwise map by name ("Mali")
    const byName = WEST_AFRICA_COUNTRIES.find((c) => c.name === raw);
    if (byName) return byName.code;
  }

  const cc2 = company?.country;
  if (typeof cc2 === 'string' && cc2.trim() !== '') return cc2.trim();

  return '';
}





type PaymentConfigFormData = {
  isEnabled: boolean;
  merchantCode: string;
  phoneNumber: string;
};

const emptyFormData: PaymentConfigFormData = {
  isEnabled: true,
  merchantCode: '',
  phoneNumber: '',
};

type PaymentMethodForm = {
  methodId: string;
};

type PaymentMethodGlobalExtended = PaymentMethodGlobal & {
  requiresMerchantCode?: boolean;
  requiresPhoneNumber?: boolean;
  instructions?: string;
  type?: string;
};

interface CompanyPaymentSettingsPageProps {
  companyId?: string;
}


const CompanyPaymentSettingsPage: React.FC<CompanyPaymentSettingsPageProps> = ({ companyId: companyIdProp }) => {
  const { user, company } = useAuth();
  const companyId = companyIdProp ?? user?.companyId ?? '';
  const theme = useCompanyTheme(company);

  const [availableMethods, setAvailableMethods] = useState<PaymentMethodGlobalExtended[]>([]);
  const [configsByMethodId, setConfigsByMethodId] = useState<Record<string, PaymentConfigByCompany>>({});

  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [countryCode, setCountryCode] = useState<string>('');
  const [formData, setFormData] = useState<PaymentConfigFormData>(emptyFormData);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPaymentConfigNotReady = !countryCode;


  // ----- Chargement (paymentMethods globaux + paymentConfigs compagnie)
  useEffect(() => {
    const fetchData = async () => {
      if (!companyId) return;

      try {
        console.log('[CompanyPaymentSettingsPage] USER ROLE', (user as any)?.role ?? null);
        console.log('[CompanyPaymentSettingsPage] USER COMPANY ID', (user as any)?.companyId ?? null);
        console.log('[CompanyPaymentSettingsPage] USER AGENCY ID', (user as any)?.agencyId ?? null);
        console.log('[CompanyPaymentSettingsPage] RESOLVED COMPANY OBJECT', company);

        const cc = resolveCompanyCountryCode(company);
        console.log("[CompanyPaymentSettingsPage] resolved countryCode", cc);
        if (!cc) {
          setError('Code pays de la compagnie manquant');
          return;
        }
        setCountryCode(cc);
        setError(null);

        // 1) paymentMethods
        try {
          console.log('[CompanyPaymentSettingsPage] DEBUG before paymentMethods query', {
            cc,
            userCompanyId: (user as any)?.companyId ?? null,
            userCompagnieId: (user as any)?.compagnieId ?? null,
            userRole: (user as any)?.role ?? null,
          });

          const methodsQ = query(
            collection(db, 'paymentMethods'),
            where('countryCode', '==', cc),
            where('active', '==', true)
          );

          const methodsSnap = await getDocs(methodsQ);
          const methods = methodsSnap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })) as PaymentMethodGlobalExtended[];

          setAvailableMethods(methods);
        } catch (err) {
          console.error('[CompanyPaymentSettingsPage] paymentMethods load failed', err);
          setError('Erreur lors du chargement des méthodes de paiement');
          return;
        }

        // 2) paymentConfigs
        try {
          const configsSnap = await getDocs(collection(db, 'companies', companyId, 'paymentConfigs'));
          const configsMap: Record<string, PaymentConfigByCompany> = {};
          configsSnap.docs.forEach((d) => {
            const cfg = d.data() as Omit<PaymentConfigByCompany, 'methodId'> & { methodId?: string };
            configsMap[d.id] = {
              methodId: cfg.methodId ?? d.id,
              companyId,
              isEnabled: Boolean((cfg as any).isEnabled ?? true),
              merchantCode: (cfg as any).merchantCode,
              phoneNumber: (cfg as any).phoneNumber,
              updatedAt: (cfg as any).updatedAt,
            };
          });

          setConfigsByMethodId(configsMap);
        } catch (err) {
          console.error('[CompanyPaymentSettingsPage] paymentConfigs load failed', err);
          setError('Erreur lors du chargement des configurations');
          return;
        }

      } catch (err) {
        console.error('[CompanyPaymentSettingsPage] load failed (unexpected)', err);
        setError('Erreur lors du chargement des moyens de paiement');
      }

    };

    fetchData();
  }, [companyId, company]);


  // ----- Form change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleEnabledToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, isEnabled: e.target.checked }));
  };

  // ----- Submit (create/update paymentConfig)
  const handleSubmit = async (e: React.FormEvent) => {
    console.log("[CompanyPaymentSettingsPage] save config clicked");
    e.preventDefault();
    setError(null);
    console.log("[CompanyPaymentSettingsPage] formData", formData);



    if (!companyId) {
      setError('Aucune compagnie associée.');
      return;
    }
    if (!selectedMethodId) {
      setError('Sélectionnez une méthode.');
      return;
    }

    const methodGlobal = availableMethods.find((m) => m.id === selectedMethodId);
    if (!methodGlobal) {
      setError('Méthode introuvable.');
      return;
    }

    const requiresMerchantCode = Boolean(methodGlobal.requiresMerchantCode);
    const requiresPhoneNumber = Boolean(methodGlobal.requiresPhoneNumber);

    if (requiresMerchantCode && !formData.merchantCode.trim()) {
      setError('merchantCode requis pour cette méthode.');
      return;
    }
    if (requiresPhoneNumber && !formData.phoneNumber.trim()) {
      setError('phoneNumber requis pour cette méthode.');
      return;
    }

    setLoading(true);

    try {
      const cfgRef = doc(db, 'companies', companyId, 'paymentConfigs', selectedMethodId);
      const payload: any = {
        methodId: selectedMethodId,
        providerCode: (methodGlobal as any).providerCode ?? undefined,
        merchantCode: requiresMerchantCode ? formData.merchantCode.trim() : null,
        phoneNumber: requiresPhoneNumber ? formData.phoneNumber.trim() : null,
        isEnabled: formData.isEnabled,
        active: formData.isEnabled,
        updatedAt: serverTimestamp(),
      };
      console.log("[CompanyPaymentSettingsPage] config payload", payload);


      console.log("[CompanyPaymentSettingsPage] writing paymentConfigs", {
        path: `companies/${companyId}/paymentConfigs/${selectedMethodId}`,
        payload,
      });

      await setDoc(cfgRef, payload, { merge: true });

      // Refresh local state
      setConfigsByMethodId((prev) => ({
        ...prev,
        [selectedMethodId]: {
          methodId: selectedMethodId,
          companyId,
          isEnabled: formData.isEnabled,
          merchantCode: requiresMerchantCode ? formData.merchantCode.trim() : undefined,
          phoneNumber: requiresPhoneNumber ? formData.phoneNumber.trim() : undefined,
          updatedAt: new Date() as any,
        },
      }));
    } catch (error: any) {
      console.error("[CompanyPaymentSettingsPage] save config failed", {
        code: error?.code,
        message: error?.message,
        error,
      });
      setError('Erreur lors de la sauvegarde');
    } finally {
      setLoading(false);
    }

  };

  const handleSelectMethod = (method: PaymentMethodGlobalExtended) => {
    setSelectedMethodId(method.id ?? null);

    const cfg = configsByMethodId[method.id ?? ''];
    setFormData({
      isEnabled: cfg?.isEnabled ?? true,
      merchantCode: cfg?.merchantCode ?? '',
      phoneNumber: cfg?.phoneNumber ?? '',
    });
  };

  const handleToggleEnabledOnly = async (methodId: string) => {
    if (!companyId) return;
    if (!methodId) return;

    const current = configsByMethodId[methodId];
    const nextEnabled = !(current?.isEnabled ?? true);

    setLoading(true);
    try {
      const cfgRef = doc(db, 'companies', companyId, 'paymentConfigs', methodId);
      await setDoc(
        cfgRef,
        {
          companyId,
          methodId,
          isEnabled: nextEnabled,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setConfigsByMethodId((prev) => ({
        ...prev,
        [methodId]: { ...prev[methodId], companyId, methodId, isEnabled: nextEnabled } as PaymentConfigByCompany,
      }));
    } catch (err) {
      console.error('Error toggling payment config enabled:', err);
      setError('Erreur lors du changement du statut');
    } finally {
      setLoading(false);
    }
  };


  const subtitle =
    availableMethods.length > 0
      ? `${availableMethods.length} méthode${availableMethods.length > 1 ? 's' : ''} disponible${availableMethods.length > 1 ? 's' : ''} pour ${countryCode || 'le pays'}`

      : 'Aucune méthode de paiement disponible pour votre pays';

  return (

    <StandardLayoutWrapper>
      <PageHeader title="Moyens de paiement" subtitle={subtitle} />
      <p className="text-sm text-gray-600 mb-6">
        Ces moyens de paiement (comptes mobile money, etc.) sont définis au niveau de la compagnie et servent à encaisser les paiements des réservations en ligne. Les clients les choisissent lors du dépôt de preuve de paiement.
      </p>
      {error && (
        <div className="border border-gray-300 bg-gray-50 p-4 mb-6 rounded-lg text-gray-800">
          <p>{error}</p>
        </div>
      )}

      <SectionCard title="Méthodes disponibles" icon={CreditCard}>
        {availableMethods.length === 0 ? (
          <p className="text-gray-500 italic">Aucune méthode de paiement disponible</p>
        ) : (
          <div
            className={cn(
              'grid gap-4',
              'grid-cols-1',
              'sm:grid-cols-2',
              'md:grid-cols-3',
              'lg:grid-cols-4'
            )}
          >
            {availableMethods.map((method) => {
              const cfg = configsByMethodId[method.id ?? ''];
              const enabled = cfg?.isEnabled ?? true;

              return (
                <div
                  key={method.id}
                  className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-12 w-12 shrink-0 rounded border border-gray-100 bg-gray-50 overflow-hidden flex items-center justify-center">
                      <img
                        src={method.logoUrl}
                        alt={method.name}
                        className="h-10 w-10 object-contain"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-900 truncate">{method.name}</div>
                      <div className="text-xs text-gray-500 truncate mt-1">
                        Statut :{' '}
                        <span className={enabled ? 'text-green-600' : 'text-gray-500'}>
                          {enabled ? 'Activé' : 'Désactivé'}
                        </span>
                      </div>
                      {method.type && (
                        <div className="text-xs text-gray-500 truncate mt-1">
                          Type : {method.type}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => handleSelectMethod(method)}
                      className="flex-1 px-3 py-1 text-sm rounded transition"
                      style={{ backgroundColor: `${theme.colors.primary}15`, color: theme.colors.primary }}
                    >
                      Configurer
                    </button>
                    <button
                      onClick={() => method.id && handleToggleEnabledOnly(method.id)}
                      className="flex-1 px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 text-gray-700 transition"
                    >
                      {enabled ? 'Désactiver' : 'Activer'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>


      <SectionCard
        title={selectedMethodId ? 'Configurer la méthode' : 'Sélectionnez une méthode'}
        icon={CreditCard}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {selectedMethodId ? (
            (() => {
              const methodGlobal = availableMethods.find((m) => m.id === selectedMethodId);
              const requiresMerchantCode = Boolean(methodGlobal?.requiresMerchantCode);
              const requiresPhoneNumber = Boolean(methodGlobal?.requiresPhoneNumber);

              return (
                <>
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                      <input
                        type="checkbox"
                        checked={formData.isEnabled}
                        onChange={handleEnabledToggle}
                      />
                      Active
                    </label>
                  </div>

                  {requiresMerchantCode && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">merchantCode *</label>
                      <input
                        type="text"
                        name="merchantCode"
                        value={formData.merchantCode}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                        placeholder="Ex: MERCHANT_ID"
                        required
                      />
                    </div>
                  )}

                  {requiresPhoneNumber && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">phoneNumber *</label>
                      <input
                        type="text"
                        name="phoneNumber"
                        value={formData.phoneNumber}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                        placeholder="Ex: 770123456"
                        required
                      />
                    </div>
                  )}

                  {methodGlobal?.instructions && (
                    <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 p-3 rounded">
                      <p className="font-medium mb-1">Instructions</p>
                      <p className="text-gray-700 whitespace-pre-wrap">{methodGlobal.instructions}</p>
                    </div>
                  )}

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full flex justify-center py-2 px-4 rounded-md text-sm font-medium text-white transition"
                      style={{ backgroundColor: loading ? '#9ca3af' : theme.colors.primary }}
                    >
                      {loading ? 'Enregistrement...' : 'Enregistrer'}
                    </button>
                  </div>
                </>
              );
            })()
          ) : (
            <p className="text-gray-500 italic">Cliquez sur “Configurer” pour renseigner votre merchantCode / phoneNumber.</p>
          )}
        </form>
      </SectionCard>
    </StandardLayoutWrapper>
  );
};

export default CompanyPaymentSettingsPage;
