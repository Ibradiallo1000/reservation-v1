// ✅ COMPOSANT : FinalCTA
// Section finale d'appel à l'action (CTA)
// Encourage l'utilisateur à réserver ou à trouver une agence
// Comporte deux boutons avec animation Framer Motion

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Company } from '@/types/companyTypes';
import { hexToRgba } from '@/utils/color';

interface FinalCTAProps {
  company: Company;
  slug: string;
  colors: { primary: string };
  navigate: (path: string) => void;
  setShowAgences: (value: boolean) => void;
}

const FinalCTA: React.FC<FinalCTAProps> = ({ company, slug, colors, navigate, setShowAgences }) => {
  return (
    <motion.section 
      className="py-6 mt-[-20px] px-4 bg-transparent"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8 }}
    >
      <div className="max-w-4xl mx-auto text-center">
        {/* ✅ Titre d'appel */}
        <motion.h2 
          className="text-3xl md:text-4xl font-bold mb-4 text-white"
          initial={{ y: 20 }}
          whileInView={{ y: 0 }}
          transition={{ duration: 0.5 }}
        >
          Prêt à voyager avec {company.nom} ?
        </motion.h2>

        {/* ✅ Texte de sous-titre */}
        <motion.p 
          className="text-lg text-gray-300 mb-6 max-w-2xl mx-auto"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          Réservez dès maintenant votre prochain trajet en toute simplicité et sécurité.
        </motion.p>

        {/* ✅ Boutons d'action */}
        <motion.div 
          className="flex flex-col sm:flex-row justify-center gap-4"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          {/* ✅ BOUTON PRIMAIRE : Réserver maintenant */}
          <motion.button
            whileHover={{ 
              scale: 1.05,
              boxShadow: `0 8px 25px ${hexToRgba(colors.primary, 0.4)}`
            }}
            whileTap={{ scale: 0.98 }}
            className="px-8 py-3 rounded-xl font-bold text-lg bg-white text-black hover:bg-gray-100 transition"
            onClick={() => navigate(`/compagnie/${slug}/resultats`)}
            style={{
              boxShadow: `0 4px 15px ${hexToRgba(colors.primary, 0.3)}`
            }}
          >
            Réserver maintenant
          </motion.button>

          {/* ✅ BOUTON SECONDAIRE : Trouver une agence */}
          <motion.button
            whileHover={{ 
              scale: 1.05,
              backgroundColor: 'rgba(255, 255, 255, 0.15)'
            }}
            whileTap={{ scale: 0.98 }}
            className="px-8 py-3 rounded-xl font-bold text-lg border-2 border-white text-white transition"
            onClick={() => setShowAgences(true)}
            style={{
              borderColor: colors.primary
            }}
          >
            Trouver une agence
          </motion.button>
        </motion.div>
      </div>
    </motion.section>
  );
};

export default FinalCTA;
