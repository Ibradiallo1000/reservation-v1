import React, { useEffect, useState } from 'react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Avis {
  id: string;
  nom: string;
  note: number;
  commentaire: string;
  date?: string;
}

interface Props {
  companyId: string;
  primaryColor: string;
  secondaryColor?: string;
  isMobile?: boolean;
}

const AvisListePublic: React.FC<Props> = ({ companyId, primaryColor, secondaryColor = '#f8fafc' }) => {
  const { t } = useTranslation();
  const [avis, setAvis] = useState<Avis[]>([]);
  const [current, setCurrent] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (!companyId) return;

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
        const data = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          date: d.data().date?.toDate().toLocaleDateString('fr-FR')
        })) as Avis[];
        setAvis(data);
      } catch (error) {
        console.error('Erreur chargement avis :', error);
      }
    };

    fetchAvis();
  }, [companyId]);

  useEffect(() => {
    if (avis.length <= 1 || isHovered) return;
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % avis.length);
    }, 7000);
    return () => clearInterval(interval);
  }, [avis, isHovered]);

  const nextAvis = () => setCurrent((prev) => (prev + 1) % avis.length);
  const prevAvis = () => setCurrent((prev) => (prev - 1 + avis.length) % avis.length);

  if (avis.length === 0) return null;

  const currentAvis = avis[current];

  const renderStars = () => {
    return Array(5).fill(0).map((_, i) => (
      <Star
        key={i}
        size={16}
        className={i < currentAvis.note ? 'fill-current' : ''}
        style={{ color: i < currentAvis.note ? primaryColor : '#d1d5db' }}
      />
    ));
  };

  return (
    <div className="py-10 px-4 md:px-6" style={{ backgroundColor: secondaryColor }}>
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold mb-1" style={{ color: primaryColor }}>
            {t('whatCustomersSay')}
          </h2>
          <p className="text-gray-600 text-sm">
            {t('authenticExperience')}
          </p>
        </div>

        <div
          className="relative"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentAvis.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="bg-white rounded-lg shadow-md p-6"
            >
              <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
                <div className="w-12 h-12 flex items-center justify-center rounded-full" style={{ backgroundColor: `${primaryColor}20` }}>
                  <User size={24} style={{ color: primaryColor }} />
                </div>

                <div className="text-center sm:text-left">
                  <div className="flex justify-center sm:justify-start mb-2">
                    {renderStars()}
                  </div>

                  <p className="text-sm italic text-gray-700 mb-2">"{currentAvis.commentaire}"</p>

                  <p className="text-sm font-medium text-gray-900">{currentAvis.nom}</p>
                  {currentAvis.date && (
                    <p className="text-xs text-gray-500">{currentAvis.date}</p>
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {avis.length > 1 && (
            <>
              <button
                onClick={prevAvis}
                className="absolute left-0 top-1/2 -translate-y-1/2 bg-white p-1 rounded-full shadow hover:bg-gray-50"
              >
                <ChevronLeft size={20} style={{ color: primaryColor }} />
              </button>

              <button
                onClick={nextAvis}
                className="absolute right-0 top-1/2 -translate-y-1/2 bg-white p-1 rounded-full shadow hover:bg-gray-50"
              >
                <ChevronRight size={20} style={{ color: primaryColor }} />
              </button>
            </>
          )}
        </div>

        {avis.length > 1 && (
          <div className="flex justify-center gap-1 mt-4">
            {avis.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrent(idx)}
                className={`w-2 h-2 rounded-full transition-all ${
                  current === idx ? 'bg-gray-800 scale-110' : 'bg-gray-300'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AvisListePublic;
