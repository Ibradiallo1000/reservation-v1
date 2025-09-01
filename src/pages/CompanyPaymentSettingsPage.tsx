// =============================================
// src/pages/CompanyPaymentSettingsPage.tsx
// =============================================
import React, { useEffect, useState } from 'react';
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  updateDoc,
  doc,
  deleteDoc,
  deleteField,
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { usePageHeader } from '@/contexts/PageHeaderContext';
import useCompanyTheme from '@/hooks/useCompanyTheme';

interface PaymentMethod {
  id?: string;
  name: string;
  logoUrl: string;
  merchantNumber: string;
  defaultPaymentUrl?: string;
  ussdPattern?: string;
  companyId?: string;
}

const fieldKeyFromName = (name: string) =>
  name.toLowerCase().trim().replace(/\s+/g, '_');

/** 🔧 Helper pour contourner le typing strict d'updateDoc avec clé calculée */
async function updateCompanyPaymentMirror(
  companyId: string,
  fieldKey: string,
  data: { url: string; logoUrl: string; ussdPattern?: string } | null
) {
  const companyRef = doc(db, 'companies', companyId);
  // ⚠️ Important: typer explicitement en objet indexé -> pas d'erreur TS 2345
  const payload: Record<string, any> =
    data === null
      ? { [`paymentMethods.${fieldKey}`]: deleteField() }
      : { [`paymentMethods.${fieldKey}`]: data };
  return updateDoc(companyRef, payload as any);
}

const CompanyPaymentSettingsPage: React.FC = () => {
  const { user, company } = useAuth();
  const theme = useCompanyTheme(company);
  const { setHeader, resetHeader } = usePageHeader();

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [formData, setFormData] = useState<Omit<PaymentMethod, 'id'>>({
    name: '',
    logoUrl: '',
    merchantNumber: '',
    defaultPaymentUrl: '',
    ussdPattern: '',
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ----- Header dynamique
  useEffect(() => {
    setHeader({
      title: 'Moyens de paiement',
      subtitle:
        paymentMethods.length > 0
          ? `${paymentMethods.length} méthode${paymentMethods.length > 1 ? 's' : ''} configurée${paymentMethods.length > 1 ? 's' : ''}`
          : 'Aucune méthode configurée',
      bg: `linear-gradient(90deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`,
      fg: '#fff',
    });
    return () => resetHeader();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethods.length, theme.colors.primary, theme.colors.secondary]);

  // ----- Chargement
  useEffect(() => {
    const fetchPaymentMethods = async () => {
      if (!user?.companyId) return;

      try {
        const qy = query(
          collection(db, 'paymentMethods'),
          where('companyId', '==', user.companyId)
        );
        const snapshot = await getDocs(qy);
        const methods = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data(),
        })) as PaymentMethod[];
        setPaymentMethods(methods);
      } catch (err) {
        console.error('Error fetching payment methods:', err);
        setError('Erreur lors du chargement des méthodes de paiement');
      }
    };

    fetchPaymentMethods();
  }, [user?.companyId]);

  // ----- Form change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // ----- Submit (create / update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user?.companyId) {
      setError('Aucune compagnie associée.');
      return;
    }

    const { name, logoUrl, merchantNumber, ussdPattern, defaultPaymentUrl } = formData;
    if (!name || !logoUrl || !merchantNumber || !ussdPattern) {
      setError('Veuillez remplir tous les champs obligatoires.');
      return;
    }

    setLoading(true);

    try {
      const methodData: PaymentMethod = {
        ...formData,
        companyId: user.companyId,
      };

      const fieldKey = fieldKeyFromName(name);

      if (selectedId) {
        // --- Update existant
        await updateDoc(doc(db, 'paymentMethods', selectedId), methodData as any);

        // miroir dans companies.paymentMethods.<clé>
        if (defaultPaymentUrl && defaultPaymentUrl.trim() !== '') {
          await updateCompanyPaymentMirror(user.companyId, fieldKey, {
            url: defaultPaymentUrl,
            logoUrl,
            ussdPattern,
          });
        } else {
          await updateCompanyPaymentMirror(user.companyId, fieldKey, null);
        }

        setPaymentMethods(prev =>
          prev.map(m => (m.id === selectedId ? { ...methodData, id: selectedId } : m))
        );
      } else {
        // --- Création
        const ref = await addDoc(collection(db, 'paymentMethods'), methodData as any);

        if (defaultPaymentUrl && defaultPaymentUrl.trim() !== '') {
          await updateCompanyPaymentMirror(user.companyId, fieldKey, {
            url: defaultPaymentUrl,
            logoUrl,
            ussdPattern,
          });
        }

        setPaymentMethods(prev => [{ ...methodData, id: ref.id }, ...prev]);
      }

      // Reset form
      setFormData({
        name: '',
        logoUrl: '',
        merchantNumber: '',
        defaultPaymentUrl: '',
        ussdPattern: '',
      });
      setSelectedId(null);
    } catch (err) {
      console.error('Error saving payment method:', err);
      setError('Erreur lors de la sauvegarde');
    } finally {
      setLoading(false);
    }
  };

  // ----- Edit
  const handleEdit = (method: PaymentMethod) => {
    setSelectedId(method.id || null);
    setFormData({
      name: method.name,
      logoUrl: method.logoUrl,
      merchantNumber: method.merchantNumber,
      defaultPaymentUrl: method.defaultPaymentUrl || '',
      ussdPattern: method.ussdPattern || '',
    });
  };

  // ----- Delete
  const handleDelete = async (method: PaymentMethod) => {
    if (!method.id || !user?.companyId) return;

    const confirmed = window.confirm(`Supprimer la méthode ${method.name} ?`);
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'paymentMethods', method.id));

      const fieldKey = fieldKeyFromName(method.name);
      await updateCompanyPaymentMirror(user.companyId, fieldKey, null);

      setPaymentMethods(prev => prev.filter(m => m.id !== method.id));

      if (selectedId === method.id) {
        setSelectedId(null);
        setFormData({
          name: '',
          logoUrl: '',
          merchantNumber: '',
          defaultPaymentUrl: '',
          ussdPattern: '',
        });
      }
    } catch (err) {
      console.error('Error deleting payment method:', err);
      setError('Erreur lors de la suppression');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded">
          <p>{error}</p>
        </div>
      )}

      {/* Liste des méthodes existantes */}
      <div className="bg-white p-6 rounded-lg shadow-md mb-8 border border-gray-100">
        <h2 className="text-xl font-semibold mb-4">Méthodes configurées</h2>

        {paymentMethods.length === 0 ? (
          <p className="text-gray-500 italic">Aucune méthode de paiement configurée</p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {paymentMethods.map(method => (
              <li key={method.id} className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4 min-w-0">
                    <img
                      src={method.logoUrl}
                      alt={method.name}
                      className="w-12 h-12 object-contain rounded border"
                    />
                    <div className="min-w-0">
                      <h3 className="font-medium text-gray-900 truncate">{method.name}</h3>
                      <p className="text-sm text-gray-500 truncate">
                        N° Marchand: {method.merchantNumber}
                      </p>
                      {method.ussdPattern && (
                        <p className="text-xs text-green-600 truncate">
                          USSD: {method.ussdPattern}
                        </p>
                      )}
                      {method.defaultPaymentUrl && (
                        <p className="text-xs text-blue-600 truncate">
                          URL: {method.defaultPaymentUrl}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex space-x-2 shrink-0">
                    <button
                      onClick={() => handleEdit(method)}
                      className="px-3 py-1 text-sm rounded transition"
                      style={{ backgroundColor: `${theme.colors.primary}15`, color: theme.colors.primary }}
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => handleDelete(method)}
                      className="px-3 py-1 text-sm bg-red-50 text-red-700 rounded hover:bg-red-100 transition"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Formulaire d'ajout/modification */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-100">
        <h2 className="text-xl font-semibold mb-4">
          {selectedId ? 'Modifier une méthode' : 'Ajouter une nouvelle méthode'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nom de la méthode *
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
              placeholder="Ex: Orange Money"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              URL du logo *
            </label>
            <input
              type="url"
              name="logoUrl"
              value={formData.logoUrl}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
              placeholder="https://example.com/logo.png"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Numéro de marchand *
            </label>
            <input
              type="text"
              name="merchantNumber"
              value={formData.merchantNumber}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
              placeholder="Ex: 770123456"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Code USSD (avec MERCHANT et AMOUNT) *
            </label>
            <input
              type="text"
              name="ussdPattern"
              value={formData.ussdPattern}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
              placeholder="Ex: *144*8*MERCHANT*AMOUNT#"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              URL de paiement par défaut (optionnel)
            </label>
            <input
              type="url"
              name="defaultPaymentUrl"
              value={formData.defaultPaymentUrl}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
              placeholder="https://payment.example.com/pay"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 rounded-md text-sm font-medium text-white transition"
              style={{ backgroundColor: loading ? '#9ca3af' : theme.colors.primary }}
            >
              {loading ? 'En cours…' : selectedId ? 'Mettre à jour' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CompanyPaymentSettingsPage;
