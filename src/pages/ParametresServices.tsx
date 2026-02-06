// =============================================
// src/pages/ParametresServices.tsx
// =============================================
import React, { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import {
  Wifi,
  Wind,
  Zap,
  Coffee,
  Sofa,
  Tv,
  Snowflake,
  CheckCircle,
  AlertCircle,
  Save,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/* =========================
   CONFIG SERVICES
========================= */
type ServiceKey =
  | 'wifi'
  | 'climatisation'
  | 'usb'
  | 'boisson'
  | 'sieges_confort'
  | 'tv'
  | 'froid';

const SERVICES: {
  key: ServiceKey;
  label: string;
  icon: React.ReactNode;
  description: string;
}[] = [
  {
    key: 'wifi',
    label: 'Wi-Fi à bord',
    icon: <Wifi className="h-5 w-5" />,
    description: 'Connexion Internet disponible pendant le trajet',
  },
  {
    key: 'climatisation',
    label: 'Climatisation',
    icon: <Wind className="h-5 w-5" />,
    description: 'Bus climatisé',
  },
  {
    key: 'usb',
    label: 'Prise USB',
    icon: <Zap className="h-5 w-5" />,
    description: 'Recharge téléphone disponible',
  },
  {
    key: 'boisson',
    label: 'Boisson offerte',
    icon: <Coffee className="h-5 w-5" />,
    description: 'Boisson incluse pendant le voyage',
  },
  {
    key: 'sieges_confort',
    label: 'Sièges confort',
    icon: <Sofa className="h-5 w-5" />,
    description: 'Sièges larges et confortables',
  },
  {
    key: 'tv',
    label: 'Écran / TV',
    icon: <Tv className="h-5 w-5" />,
    description: 'Divertissement à bord',
  },
  {
    key: 'froid',
    label: 'Eau fraîche',
    icon: <Snowflake className="h-5 w-5" />,
    description: 'Eau fraîche disponible',
  },
];

const MAX_SERVICES = 5;

/* =========================
   COMPONENT
========================= */
const ParametresServices: React.FC = () => {
  const { user } = useAuth();
  const [selectedServices, setSelectedServices] = useState<ServiceKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | '' }>({
    text: '',
    type: '',
  });

  /* ---------- load company services ---------- */
  useEffect(() => {
    if (!user?.companyId) return;

    (async () => {
      try {
        const ref = doc(db, 'companies', user.companyId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          setSelectedServices((data.services || []) as ServiceKey[]);
        }
      } catch (e) {
        console.error('Erreur chargement services:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.companyId]);

  /* ---------- toggle ---------- */
  const toggleService = (key: ServiceKey) => {
    setSelectedServices((prev) => {
      if (prev.includes(key)) {
        return prev.filter((s) => s !== key);
      }
      if (prev.length >= MAX_SERVICES) return prev;
      return [...prev, key];
    });
  };

  /* ---------- save ---------- */
  const handleSave = async () => {
    if (!user?.companyId) return;

    try {
      await updateDoc(doc(db, 'companies', user.companyId), {
        services: selectedServices,
      });
      setMessage({ text: 'Services enregistrés avec succès', type: 'success' });
    } catch (e) {
      console.error(e);
      setMessage({ text: "Erreur lors de l'enregistrement", type: 'error' });
    }
  };

  return (
    <div className="bg-white rounded-xl border p-6">
      <h2 className="text-lg font-semibold mb-2">Services proposés</h2>
      <p className="text-sm text-gray-500 mb-6">
        Sélectionnez les services réellement disponibles à bord.
        <br />
        <span className="font-medium">
          Maximum {MAX_SERVICES} services.
        </span>
      </p>

      {loading ? (
        <p className="text-gray-500">Chargement…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {SERVICES.map((service) => {
            const active = selectedServices.includes(service.key);
            const disabled =
              !active && selectedServices.length >= MAX_SERVICES;

            return (
              <button
                key={service.key}
                onClick={() => toggleService(service.key)}
                disabled={disabled}
                className={`flex items-start gap-3 p-4 rounded-xl border transition-all text-left
                  ${
                    active
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }
                  ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                <div
                  className={`p-2 rounded-lg ${
                    active ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {service.icon}
                </div>
                <div>
                  <p className="font-medium text-sm">{service.label}</p>
                  <p className="text-xs text-gray-500">
                    {service.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* FOOTER */}
      <div className="flex justify-between items-center mt-6">
        <p className="text-xs text-gray-500">
          {selectedServices.length}/{MAX_SERVICES} sélectionnés
        </p>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-white font-medium"
          style={{ backgroundColor: '#2563eb' }}
        >
          <Save className="h-4 w-4" />
          Enregistrer
        </button>
      </div>

      {/* MESSAGE */}
      <AnimatePresence>
        {message.text && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className={`mt-4 flex items-center gap-2 text-sm ${
              message.type === 'success'
                ? 'text-green-600'
                : 'text-red-600'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            {message.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ParametresServices;
