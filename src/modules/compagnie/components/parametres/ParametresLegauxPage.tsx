// ✅ ParametresLegauxPage.tsx — gestion multilingue des mentions

import React, { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, CheckCircle, AlertCircle } from 'lucide-react';
interface Props {
  companyId: string;
}

const ParametresLegauxPage: React.FC<Props> = ({ companyId }) => {
  const { user } = useAuth();
  const [mentionsLegales, setMentionsLegales] = useState({ fr: '', en: '' });
  const [politiqueConfidentialite, setPolitiqueConfidentialite] = useState({ fr: '', en: '' });
  const [conditionsUtilisation, setConditionsUtilisation] = useState({ fr: '', en: '' });
  const [politiqueCookies, setPolitiqueCookies] = useState({ fr: '', en: '' });
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' }>({ text: '', type: 'info' });

  useEffect(() => {
    if (user?.companyId) {
      const fetchData = async () => {
        const ref = doc(db, 'companies', user.companyId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          setMentionsLegales(data.mentionsLegales || { fr: '', en: '' });
          setPolitiqueConfidentialite(data.politiqueConfidentialite || { fr: '', en: '' });
          setConditionsUtilisation(data.conditionsUtilisation || { fr: '', en: '' });
          setPolitiqueCookies(data.politiqueCookies || { fr: '', en: '' });
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
        mentionsLegales,
        politiqueConfidentialite,
        conditionsUtilisation,
        politiqueCookies
      });
      setMessage({ text: 'Mentions mises à jour avec succès.', type: 'success' });
    } catch (e) {
      console.error(e);
      setMessage({ text: "Erreur lors de l'enregistrement.", type: 'error' });
    }
  };

  const renderTextarea = (label: string, state: any, setState: any) => (
    <div>
      <h3 className="text-lg font-semibold mb-2">{label}</h3>
      <label className="text-sm font-medium">🇫🇷 Français</label>
      <textarea rows={4} className="w-full mb-4 p-2 border rounded" value={state.fr} onChange={(e) => setState({ ...state, fr: e.target.value })} />
      <label className="text-sm font-medium">🇬🇧 English</label>
      <textarea rows={4} className="w-full p-2 border rounded" value={state.en} onChange={(e) => setState({ ...state, en: e.target.value })} />
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded shadow">
      <h2 className="text-xl font-bold mb-6">Mentions légales & politiques multilingues</h2>

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

      <div className="space-y-8">
        {renderTextarea('Mentions légales', mentionsLegales, setMentionsLegales)}
        {renderTextarea('Politique de confidentialité', politiqueConfidentialite, setPolitiqueConfidentialite)}
        {renderTextarea("Conditions d'utilisation", conditionsUtilisation, setConditionsUtilisation)}
        {renderTextarea("Politique de cookies", politiqueCookies, setPolitiqueCookies)}
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
