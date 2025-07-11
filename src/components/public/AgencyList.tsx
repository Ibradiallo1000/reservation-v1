// ✅ AGENCY LIST - Version Professionnelle
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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl"
        initial={{ scale: 0.96, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 20 }}
        transition={{ type: 'spring', damping: 25 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#ffffff',
          boxShadow: '0 10px 30px rgba(0,0,0,0.15)'
        }}
      >
        {/* Header avec effet de verre */}
        <div 
          className="sticky top-0 p-5 flex justify-between items-center z-10 border-b border-gray-100"
          style={{
            backdropFilter: 'blur(12px)',
            backgroundColor: 'rgba(255,255,255,0.85)'
          }}
        >
          <h2 className="text-2xl font-bold" style={{ color: primaryColor }}>
            {t('ourAgencies')}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
            aria-label={t('close')}
          >
            <X className="h-6 w-6 text-gray-600" />
          </button>
        </div>

        <div className="p-5">
          {Object.entries(groupedByVille).map(([ville, agences]) => (
            <div key={ville} className="mb-5">
              <motion.button
                onClick={() => toggleVille(ville)}
                className="w-full text-left py-4 px-5 rounded-xl flex justify-between items-center transition-colors"
                whileHover={{ backgroundColor: 'rgba(0,0,0,0.03)' }}
                style={{ 
                  backgroundColor: openVilles[ville] ? 'rgba(0,0,0,0.02)' : 'transparent',
                  color: '#333'
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-lg">{ville}</span>
                  <span 
                    className="text-sm px-2 py-1 rounded-full"
                    style={{ 
                      backgroundColor: `${primaryColor}20`,
                      color: primaryColor
                    }}
                  >
                    {agences.length} {agences.length > 1 ? t('agencies') : t('agency')}
                  </span>
                </div>
                {openVilles[ville] ? (
                  <ChevronUp className="h-5 w-5 text-gray-500" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-gray-500" />
                )}
              </motion.button>

              <AnimatePresence>
                {openVilles[ville] && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className="overflow-hidden pl-5 ml-2 border-l-2"
                    style={{ borderColor: `${primaryColor}40` }}
                  >
                    {agences.map((agence, index) => (
                      <AgencyItem
                        key={`${agence.id}-${index}`}
                        agence={agence}
                        primaryColor={primaryColor}
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