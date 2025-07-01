import React, { useEffect, useState } from 'react';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';

interface PaymentMethod {
  id?: string;
  name: string;
  logoUrl: string;
  merchantNumber: string;
  defaultPaymentUrl?: string;
}

const CompanyPaymentSettingsPage: React.FC = () => {
  const { user } = useAuth();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [merchantNumber, setMerchantNumber] = useState('');
  const [defaultPaymentUrl, setDefaultPaymentUrl] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchMethods = async () => {
      if (!user?.companyId) return;

      const q = query(
        collection(db, 'paymentMethods'),
        where('companyId', '==', user.companyId)
      );
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as PaymentMethod[];
      setPaymentMethods(list);
    };

    fetchMethods();
  }, [user?.companyId]);

  const handleAddMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.companyId) return;

    if (!name || !merchantNumber || !logoUrl) {
      alert('Tous les champs sont obligatoires.');
      return;
    }

    setLoading(true);

    try {
      await addDoc(collection(db, 'paymentMethods'), {
        companyId: user.companyId,
        name,
        logoUrl,
        merchantNumber,
        defaultPaymentUrl
      });

      setName('');
      setLogoUrl('');
      setMerchantNumber('');
      setDefaultPaymentUrl('');
      alert('Méthode ajoutée !');
      window.location.reload();

    } catch (error) {
      console.error(error);
      alert('Erreur lors de l\'ajout');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">⚙️ Gestion des Moyens de Paiement</h1>

      {/* Liste existante */}
      <div className="bg-white p-4 rounded-lg shadow mb-8">
        <h2 className="text-xl font-semibold mb-3">✅ Moyens configurés</h2>
        {paymentMethods.length === 0 ? (
          <p className="text-gray-500">Aucun moyen configuré pour le moment.</p>
        ) : (
          <ul className="space-y-4">
            {paymentMethods.map(method => (
              <li key={method.id} className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-4">
                  <img src={method.logoUrl} alt={method.name} className="w-10 h-10 rounded object-contain border" />
                  <div>
                    <p className="font-bold">{method.name}</p>
                    <p className="text-sm text-gray-600">Marchand: {method.merchantNumber}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Formulaire ajout */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-3">➕ Ajouter un moyen</h2>
        <form onSubmit={handleAddMethod} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Nom *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border px-3 py-2 rounded"
              placeholder="Ex: Orange Sarali"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">URL Logo *</label>
            <input
              type="text"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              className="w-full border px-3 py-2 rounded"
              placeholder="Lien vers le logo"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Numéro marchand *</label>
            <input
              type="text"
              value={merchantNumber}
              onChange={(e) => setMerchantNumber(e.target.value)}
              className="w-full border px-3 py-2 rounded"
              placeholder="Ex: 123456"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">URL de redirection (facultatif)</label>
            <input
              type="text"
              value={defaultPaymentUrl}
              onChange={(e) => setDefaultPaymentUrl(e.target.value)}
              className="w-full border px-3 py-2 rounded"
              placeholder="https://..."
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`px-6 py-2 rounded text-white font-medium ${loading ? 'bg-gray-400' : 'bg-indigo-600 hover:bg-indigo-700'}`}
          >
            {loading ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CompanyPaymentSettingsPage;
