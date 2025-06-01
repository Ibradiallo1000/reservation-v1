// ✅ ParametresLegauxPage.tsx — configuration des mentions légales et politiques

import React, { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, CheckCircle, AlertCircle } from 'lucide-react';

const ParametresLegauxPage: React.FC = () => {
  const { user } = useAuth();
  const [politiqueConfidentialite, setPolitiqueConfidentialite] = useState('');
  const [conditionsUtilisation, setConditionsUtilisation] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' }>({ text: '', type: 'info' });

  useEffect(() => {
    if (user?.companyId) {
      const fetchData = async () => {
        const ref = doc(db, 'companies', user.companyId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          setPolitiqueConfidentialite(data.politiqueConfidentialite || '');
          setConditionsUtilisation(data.conditionsUtilisation || '');
        }
      };
      fetchData();
    }
  }, [user]);

  const handleSave = async () => {
    if (!user?.companyId) return;
    setMessage({ text: 'Enregistrement en cours...', type: 'info' });
    try {
      const ref = doc(db, 'companies', user.companyId);
      await updateDoc(ref, {
        politiqueConfidentialite,
        conditionsUtilisation
      });
      setMessage({ text: 'Mentions mises à jour avec succès.', type: 'success' });
    } catch (e) {
      console.error(e);
      setMessage({ text: "Erreur lors de l'enregistrement.", type: 'error' });
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded shadow">
      <h2 className="text-xl font-bold mb-6">Mentions légales & politique de confidentialité</h2>

      <AnimatePresence>
        {message.text && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`p-4 rounded mb-4 ${
              message.type === 'success'
                ? 'bg-green-100 text-green-800'
                : message.type === 'error'
                ? 'bg-red-100 text-red-800'
                : 'bg-blue-100 text-blue-800'
            }`}
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                {message.type === 'success' ? <CheckCircle /> : message.type === 'error' ? <AlertCircle /> : <Save />}
                <span>{message.text}</span>
              </div>
              {message.type === 'success' && (
                <button
                  onClick={() => setMessage({ text: '', type: 'info' })}
                  className="text-sm underline"
                >
                  OK
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-2">Politique de confidentialité</h3>
          <textarea
            rows={6}
            value={politiqueConfidentialite}
            onChange={(e) => setPolitiqueConfidentialite(e.target.value)}
            className="w-full border border-gray-300 rounded p-3"
            placeholder="Expliquer comment les données clients sont collectées et utilisées."
          />
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-2">Conditions d'utilisation</h3>
          <textarea
            rows={6}
            value={conditionsUtilisation}
            onChange={(e) => setConditionsUtilisation(e.target.value)}
            className="w-full border border-gray-300 rounded p-3"
            placeholder="Lister les règles d'utilisation de la plateforme par les clients."
          />
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            className="bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-2 rounded flex items-center gap-2"
          >
            <Save size={18} /> Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
};

export default ParametresLegauxPage;
