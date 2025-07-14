// ✅ Fichier : AvisListePublic.tsx - Version corrigée

import React, { useEffect, useState } from 'react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { motion, AnimatePresence } from 'framer-motion';

interface Avis {
  id: string;
  nom: string;
  note: number;
  commentaire: string;
}

interface Props {
  companyId: string;
  primaryColor: string;
  isMobile?: boolean;
}

const AvisListePublic: React.FC<Props> = ({ companyId, primaryColor }) => {
  const [avis, setAvis] = useState<Avis[]>([]);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!companyId) return; // ✅ Bloque la requête si pas encore prêt

    const fetchAvis = async () => {
      try {
        const q = query(
          collection(db, 'avis'),
          where('companyId', '==', companyId),
          where('visible', '==', true),
          orderBy('note', 'desc'),
          limit(10)
        );
        const snap = await getDocs(q);
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Avis[];
        setAvis(data);
      } catch (error) {
        console.error('Erreur lors du chargement des avis:', error);
      }
    };

    fetchAvis();
  }, [companyId]);

  // ✅ Défilement automatique
  useEffect(() => {
    if (avis.length <= 1) return;

    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % avis.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [avis]);

  if (avis.length === 0) return null;

  const currentAvis = avis[current];

  return (
    <div className="max-w-2xl mx-auto py-12 text-center">
      <h3 className="text-xl font-semibold mb-4" style={{ color: primaryColor }}>
        Ce que disent nos clients
      </h3>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentAvis.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.5 }}
          className="p-6 bg-white shadow rounded-lg"
        >
          <p className="italic text-gray-700 mb-3">"{currentAvis.commentaire}"</p>
          <p className="font-medium text-gray-900">{currentAvis.nom} — ⭐ {currentAvis.note}</p>
        </motion.div>
      </AnimatePresence>

      {/* ✅ Dots de navigation */}
      <div className="flex justify-center gap-2 mt-4">
        {avis.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrent(idx)}
            className={`w-3 h-3 rounded-full transition-all ${
              current === idx ? 'bg-blue-600 scale-110' : 'bg-gray-300'
            }`}
          />
        ))}
      </div>
    </div>
  );
};

export default AvisListePublic;
