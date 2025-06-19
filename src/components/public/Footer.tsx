import React from 'react';
import { motion } from 'framer-motion';
import { 
  Mail, Phone, MapPin, Clock, Info, ThumbsUp, 
  Facebook, Instagram, Twitter, Linkedin, Youtube, MessageCircle
} from 'lucide-react';
import { Company } from '@/types/companyTypes';

interface FooterProps {
  company: Company;
}

const Footer: React.FC<FooterProps> = ({ company }) => {
  const currentYear = new Date().getFullYear();
  const socialMedia = company.socialMedia || {};

  return (
    <footer 
      className="w-full"
      style={{ 
        backgroundColor: company.couleurSecondaire || '#f8fafc',
        color: '#1e293b' // Couleur de texte par défaut (slate-800)
      }}
    >
      <div className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {/* À propos */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Info className="h-5 w-5" style={{ color: company.couleurPrimaire }} />
            <h3 className="text-lg font-semibold">À propos</h3>
          </div>
          <p className="text-sm text-gray-700">
            {company.description || "Votre compagnie de transport préférée, offrant des trajets confortables et sécurisés à travers le pays."}
          </p>
        </motion.div>

        {/* Contact */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div className="flex items-center gap-2 mb-4">
            <MessageCircle className="h-5 w-5" style={{ color: company.couleurPrimaire }} />
            <h3 className="text-lg font-semibold">Contact</h3>
          </div>
          <ul className="space-y-2 text-sm">
            {company.telephone && (
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                <a href={`tel:${company.telephone}`} className="hover:underline">
                  {company.telephone}
                </a>
              </li>
            )}
            {company.email && (
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                <a href={`mailto:${company.email}`} className="hover:underline">
                  {company.email}
                </a>
              </li>
            )}
          </ul>
        </motion.div>

        {/* Réseaux sociaux */}
        {Object.values(socialMedia).some(Boolean) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <ThumbsUp className="h-5 w-5" style={{ color: company.couleurPrimaire }} />
              <h3 className="text-lg font-semibold">Suivez-nous</h3>
            </div>
            <div className="flex gap-4">
              {socialMedia.facebook && (
                <a href={socialMedia.facebook} target="_blank" rel="noopener noreferrer">
                  <Facebook className="h-6 w-6 hover:opacity-80 transition" />
                </a>
              )}
              {socialMedia.instagram && (
                <a href={socialMedia.instagram} target="_blank" rel="noopener noreferrer">
                  <Instagram className="h-6 w-6 hover:opacity-80 transition" />
                </a>
              )}
              {socialMedia.twitter && (
                <a href={socialMedia.twitter} target="_blank" rel="noopener noreferrer">
                  <Twitter className="h-6 w-6 hover:opacity-80 transition" />
                </a>
              )}
              {socialMedia.linkedin && (
                <a href={socialMedia.linkedin} target="_blank" rel="noopener noreferrer">
                  <Linkedin className="h-6 w-6 hover:opacity-80 transition" />
                </a>
              )}
              {socialMedia.youtube && (
                <a href={socialMedia.youtube} target="_blank" rel="noopener noreferrer">
                  <Youtube className="h-6 w-6 hover:opacity-80 transition" />
                </a>
              )}
            </div>
          </motion.div>
        )}

        {/* Avis clients */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <div className="flex items-center gap-2 mb-4">
            <ThumbsUp className="h-5 w-5" style={{ color: company.couleurPrimaire }} />
            <h3 className="text-lg font-semibold">Avis clients</h3>
          </div>
          <p className="text-sm mb-4">Partagez votre expérience avec nous</p>
          <button 
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              backgroundColor: company.couleurPrimaire || '#3B82F6',
              color: 'white'
            }}
          >
            Donner son avis
          </button>
        </motion.div>
      </div>

      {/* Mentions légales */}
      <div 
        className="border-t py-6 text-center text-sm"
        style={{ borderColor: company.couleurPrimaire ? `${company.couleurPrimaire}20` : '#e2e8f0' }}
      >
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-wrap justify-center gap-4 mb-2">
            <a href="/mentions-legales" className="hover:underline">Mentions légales</a>
            <a href="/politique-de-confidentialite" className="hover:underline">Confidentialité</a>
            <a href="/conditions-generales" className="hover:underline">CGU</a>
            <a href="/cookies" className="hover:underline">Cookies</a>
          </div>
          <p>© {currentYear} {company.nom || 'Notre Compagnie'}. Tous droits réservés.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;