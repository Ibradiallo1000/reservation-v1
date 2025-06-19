// ✅ COMPOSANT : AgencyList - Liste des agences avec affichage par ville
// Affiche les agences regroupées par ville dans une fenêtre modale
// Permet à l'utilisateur de consulter les agences disponibles par ville

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import AgencyItem from './AgencyItem';
import { Agence } from '@/types/companyTypes';

interface AgencyListProps {
  groupedByVille: Record<string, Agence[]>;
  openVilles: Record<string, boolean>;
  toggleVille: (ville: string) => void;
  onClose: () => void;
  primaryColor: string;
  classes: any;
  t: (key: string) => string;
}

const AgencyList: React.FC<AgencyListProps> = ({
  groupedByVille,
  openVilles,
  toggleVille,
  onClose,
  primaryColor,
  classes,
  t,
}) => {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.6 }}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* ✅ FENÊTRE MODALE CENTRALE */}
      <motion.div
        className="relative w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-xl"
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: primaryColor }}
      >
        {/* ✅ ENTÊTE DE LA MODALE */}
        <div className="sticky top-0 p-4 bg-white/10 backdrop-blur-md flex justify-between items-center z-10">
          <h2 className="text-xl font-bold text-white">{t('ourAgencies')}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/20 transition"
            aria-label={t('close')}
          >
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        {/* ✅ LISTE DES AGENCES PAR VILLE */}
        <div className="p-4">
          {Object.entries(groupedByVille).map(([ville, agences]) => (
            <div key={ville} className="mb-4">
              {/* ✅ BOUTON POUR AFFICHER / MASQUER LES AGENCES D'UNE VILLE */}
              <motion.button
                onClick={() => toggleVille(ville)}
                className={`w-full text-left py-3 px-4 font-semibold text-lg rounded-lg flex justify-between items-center ${classes.card}`}
                whileHover={{ scale: 1.01 }}
                style={{ backgroundColor: primaryColor, color: '#fff' }}
              >
                <span>{ville}</span>
                {openVilles[ville] ? (
                  <ChevronUp className="h-5 w-5" />
                ) : (
                  <ChevronDown className="h-5 w-5" />
                )}
              </motion.button>

              {/* ✅ AFFICHAGE ANIMÉ DES AGENCES */}
              <AnimatePresence>
                {openVilles[ville] && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="pl-4 border-l-2 mt-2 overflow-hidden"
                  >
                    {agences.map((agence) => (
                      <AgencyItem
                        key={agence.id}
                        agence={agence}
                        primaryColor={primaryColor}
                        classes={classes}
                        t={t}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.section>
  );
};

export default AgencyList;
