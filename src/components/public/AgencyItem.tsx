// ✅ COMPOSANT : AgencyItem
// Ce composant affiche les informations d'une agence avec une mise en forme animée et dynamique
// Utilisé dans la liste des agences d'une compagnie (AgencyList)

import React from 'react';
import { motion } from 'framer-motion';
import { MapPin, Phone, Globe } from 'lucide-react';
import { hexToRgba } from '@/utils/color';
import { Agence } from '@/types/companyTypes';

interface AgencyItemProps {
  agence: Agence;
  primaryColor: string;
  classes: any;
  t: (key: string) => string;
}

const AgencyItem: React.FC<AgencyItemProps> = ({ agence, primaryColor, classes, t }) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.1 }}
      className={`${classes.card} p-4 my-2 rounded-lg cursor-pointer`}
      whileHover={{
        backgroundColor: hexToRgba(primaryColor, 0.3),
        transition: { duration: 0.2 },
      }}
    >
      {/* En-tête avec nom d'agence */}
      <div className="flex items-start gap-3">
        <div
          className="flex-shrink-0 mt-1 w-3 h-3 rounded-full"
          style={{ backgroundColor: primaryColor }}
        />

        <div className="flex-1">
          <h3 className="font-semibold text-lg">{agence.nomAgence}</h3>

          {/* Détails sur l'agence */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 text-sm">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 opacity-70" />
              <span>{agence.pays}</span>
            </div>

            {agence.quartier && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 opacity-70" />
                <span>{agence.quartier}</span>
              </div>
            )}

            {agence.adresse && (
              <div className="col-span-2 flex items-start gap-2">
                <MapPin className="h-4 w-4 opacity-70 mt-0.5" />
                <span>{agence.adresse}</span>
              </div>
            )}

            {agence.telephone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 opacity-70" />
                <a href={`tel:${agence.telephone}`} className="hover:underline">
                  {agence.telephone}
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default AgencyItem;