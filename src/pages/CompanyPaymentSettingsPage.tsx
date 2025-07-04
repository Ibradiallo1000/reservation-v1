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
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';

interface PaymentMethod {
  id?: string;
  name: string;
  logoUrl: string;
  merchantNumber: string;
  defaultPaymentUrl?: string;
  ussdPattern?: string; // Added ussdPattern
  companyId?: string;
}

const CompanyPaymentSettingsPage: React.FC = () => {
  const { user } = useAuth();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [formData, setFormData] = useState<Omit<PaymentMethod, 'id'>>({
    name: '',
    logoUrl: '',
    merchantNumber: '',
    defaultPaymentUrl: '',
    ussdPattern: '', // Added ussdPattern
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPaymentMethods = async () => {
      if (!user?.companyId) return;

      try {
        const q = query(
          collection(db, 'paymentMethods'),
          where('companyId', '==', user.companyId)
        );
        const snapshot = await getDocs(q);
        const methods = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        })) as PaymentMethod[];
        setPaymentMethods(methods);
      } catch (err) {
        console.error('Error fetching payment methods:', err);
        setError('Erreur lors du chargement des méthodes de paiement');
      }
    };

    fetchPaymentMethods();
  }, [user?.companyId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user?.companyId) {
      setError('Aucune compagnie associée');
      return;
    }

    const { name, logoUrl, merchantNumber, ussdPattern } = formData;
    if (!name || !logoUrl || !merchantNumber || !ussdPattern) {
      setError('Veuillez remplir tous les champs obligatoires');
      return;
    }

    setLoading(true);

    try {
      const methodData = {
        ...formData,
        companyId: user.companyId,
      };

      const fieldKey = name.toLowerCase().replace(/\s+/g, '_');

      if (selectedId) {
        // Mise à jour existante
        await updateDoc(doc(db, 'paymentMethods', selectedId), methodData);

        // Met à jour la collection companies avec l'objet complet
        if (formData.defaultPaymentUrl) {
          await updateDoc(doc(db, 'companies', user.companyId), {
            [`paymentMethods.${fieldKey}`]: {
              url: formData.defaultPaymentUrl,
              logoUrl: logoUrl,
              ussdPattern: ussdPattern // Added ussdPattern to company document
            }
          });
        }
      } else {
        // Nouvelle méthode
        await addDoc(collection(db, 'paymentMethods'), methodData);

        if (formData.defaultPaymentUrl) {
          await updateDoc(doc(db, 'companies', user.companyId), {
            [`paymentMethods.${fieldKey}`]: {
              url: formData.defaultPaymentUrl,
              logoUrl: logoUrl,
              ussdPattern: ussdPattern // Added ussdPattern to company document
            }
          });
        }
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

      window.location.reload();
    } catch (err) {
      console.error('Error saving payment method:', err);
      setError('Erreur lors de la sauvegarde');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (method: PaymentMethod) => {
    setSelectedId(method.id || null);
    setFormData({
      name: method.name,
      logoUrl: method.logoUrl,
      merchantNumber: method.merchantNumber,
      defaultPaymentUrl: method.defaultPaymentUrl || '',
      ussdPattern: method.ussdPattern || '', // Added ussdPattern
    });
  };

  const handleDelete = async (method: PaymentMethod) => {
    if (!method.id || !user?.companyId) return;

    const confirmed = window.confirm(`Supprimer la méthode ${method.name} ?`);
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'paymentMethods', method.id));

      // Suppression de la référence dans companies
      const fieldKey = method.name.toLowerCase().replace(/\s+/g, '_');
      await updateDoc(doc(db, 'companies', user.companyId), {
        [`paymentMethods.${fieldKey}`]: deleteField(),
      });

      window.location.reload();
    } catch (err) {
      console.error('Error deleting payment method:', err);
      setError('Erreur lors de la suppression');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">⚙️ Gestion des Moyens de Paiement</h1>

      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6">
          <p>{error}</p>
        </div>
      )}

      {/* Liste des méthodes existantes */}
      <div className="bg-white p-6 rounded-lg shadow-md mb-8">
        <h2 className="text-xl font-semibold mb-4">Méthodes configurées</h2>
        
        {paymentMethods.length === 0 ? (
          <p className="text-gray-500 italic">Aucune méthode de paiement configurée</p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {paymentMethods.map(method => (
              <li key={method.id} className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <img
                      src={method.logoUrl}
                      alt={method.name}
                      className="w-12 h-12 object-contain rounded"
                    />
                    <div>
                      <h3 className="font-medium text-gray-900">{method.name}</h3>
                      <p className="text-sm text-gray-500">
                        N° Marchand: {method.merchantNumber}
                      </p>
                      {method.ussdPattern && (
                        <p className="text-xs text-green-600 truncate max-w-xs">
                          USSD: {method.ussdPattern}
                        </p>
                      )}
                      {method.defaultPaymentUrl && (
                        <p className="text-xs text-blue-500 truncate max-w-xs">
                          URL: {method.defaultPaymentUrl}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleEdit(method)}
                      className="px-3 py-1 text-sm bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition"
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
      <div className="bg-white p-6 rounded-lg shadow-md">
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
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
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
              value={formData.ussdPattern || ''}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="https://payment.example.com/pay"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                loading
                  ? 'bg-gray-400'
                  : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
              }`}
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  En cours...
                </>
              ) : selectedId ? (
                'Mettre à jour'
              ) : (
                'Enregistrer'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CompanyPaymentSettingsPage;