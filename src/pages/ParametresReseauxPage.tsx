// ✅ ParametresReseauxPage.tsx — paramètres séparés pour réseaux sociaux uniquement

import React, { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { SocialPlatform } from '@/types';
import {
  CheckCircle, AlertCircle, Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const ParametresReseauxPage: React.FC = () => {
  const { user } = useAuth();
  const [companyData, setCompanyData] = useState({
    socialMedia: {
      facebook: '', instagram: '', whatsapp: '', tiktok: '', linkedin: '', youtube: ''
    },
    footerConfig: {
      showSocialMedia: true
    }
  });

  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    if (user?.companyId) {
      const fetchData = async () => {
        const ref = doc(db, 'companies', user.companyId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          setCompanyData(prev => ({
            ...prev,
            socialMedia: data.socialMedia || prev.socialMedia,
            footerConfig: data.footerConfig || prev.footerConfig
          }));
        }
      };
      fetchData();
    }
  }, [user]);

  const handleSave = async () => {
    if (!user?.companyId) return;
    setMessage({ text: 'Enregistrement...', type: 'info' });
    try {
      const ref = doc(db, 'companies', user.companyId);
      await updateDoc(ref, {
        socialMedia: companyData.socialMedia,
        footerConfig: companyData.footerConfig
      });
      setMessage({ text: 'Modifications enregistrées', type: 'success' });
    } catch (e) {
      console.error(e);
      setMessage({ text: "Erreur lors de l'enregistrement", type: 'error' });
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded shadow">
      <h2 className="text-xl font-bold mb-6">Réseaux sociaux & affichage</h2>

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
              <span>{message.text}</span>
              {message.type === 'success' && (
                <button onClick={() => setMessage({ text: '', type: '' })} className="text-sm underline">
                  OK
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-2">Liens des réseaux sociaux</h3>
          <div className="space-y-3">
            {(['facebook', 'instagram', 'whatsapp', 'tiktok', 'linkedin', 'youtube'] as SocialPlatform[]).map((platform) => (
              <input
                key={platform}
                type="url"
                placeholder={`Lien ${platform}`}
                value={companyData.socialMedia?.[platform] || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setCompanyData((prev) => ({
                    ...prev,
                    socialMedia: { ...prev.socialMedia, [platform]: val },
                  }));
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-2">Affichage dans le pied de page</h3>
          <label className="inline-flex items-center">
            <input
              type="checkbox"
              checked={companyData.footerConfig?.showSocialMedia ?? true}
              onChange={(e) => setCompanyData(prev => ({
                ...prev,
                footerConfig: { ...prev.footerConfig, showSocialMedia: e.target.checked }
              }))}
              className="mr-2"
            /> Afficher les icônes de réseaux sociaux
          </label>
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

export default ParametresReseauxPage;
