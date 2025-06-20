import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Mail, Phone, MapPin, Clock, Info, ThumbsUp, 
  Facebook, Instagram, Twitter, Linkedin, Youtube, MessageCircle,
  ChevronDown, ChevronUp
} from 'lucide-react';
import { Company } from '@/types/companyTypes';
import AvisClientForm from '../ui/AvisClientForm';
import { useNavigate } from 'react-router-dom';

interface FooterProps {
  company: Company;
}

const Footer: React.FC<FooterProps> = ({ company }) => {
  const [showAvisForm, setShowAvisForm] = useState(false);
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  
  // Destructuration des données de la compagnie
  const {
    id: companyId,
    slug,
    nom,
    couleurPrimaire,
    couleurSecondaire,
    description,
    email,
    telephone,
    adresse,
    horaires,
    socialMedia = {},
    footerConfig = {}
  } = company;

  // Configuration dynamique du footer
  const {
    showAbout = true,
    showContact = true,
    showSocial = true,
    showTestimonials = true,
    showLegalLinks = true,
    customLinks = []
  } = footerConfig;

  // Gestionnaire d'avis client
  const handleTestimonialSubmit = async (data: any) => {
    try {
      // Implémentez ici la logique d'envoi vers Firestore
      console.log('Avis soumis:', data);
      setShowAvisForm(false); // Fermer le formulaire après soumission
      return { success: true };
    } catch (error) {
      console.error('Erreur lors de l\'envoi de l\'avis:', error);
      return { success: false, error };
    }
  };

  return (
    <footer 
      className="w-full"
      style={{ 
        backgroundColor: couleurSecondaire || '#f8fafc',
        color: '#1e293b'
      }}
    >
      <div className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {/* Section À propos (conditionnelle) */}
        {showAbout && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Info className="h-5 w-5" style={{ color: couleurPrimaire }} />
              <h3 className="text-lg font-semibold">À propos</h3>
            </div>
            <p className="text-sm text-gray-700">
              {description || 'Votre compagnie de transport préférée, offrant des services de qualité.'}
            </p>
          </motion.div>
        )}

        {/* Section Contact (conditionnelle) */}
        {showContact && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <MessageCircle className="h-5 w-5" style={{ color: couleurPrimaire }} />
              <h3 className="text-lg font-semibold">Contact</h3>
            </div>
            <ul className="space-y-2 text-sm">
              {telephone && (
                <li className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  <a href={`tel:${telephone}`} className="hover:underline">
                    {telephone}
                  </a>
                </li>
              )}
              {email && (
                <li className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  <a href={`mailto:${email}`} className="hover:underline">
                    {email}
                  </a>
                </li>
              )}
              {adresse && (
                <li className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  <span>{adresse}</span>
                </li>
              )}
              {horaires && (
                <li className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>{horaires}</span>
                </li>
              )}
            </ul>
          </motion.div>
        )}

        {/* Section Réseaux sociaux (conditionnelle) */}
        {showSocial && Object.values(socialMedia).some(Boolean) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <ThumbsUp className="h-5 w-5" style={{ color: couleurPrimaire }} />
              <h3 className="text-lg font-semibold">Suivez-nous</h3>
            </div>
            <div className="flex gap-4">
              {socialMedia.facebook && (
                <a href={socialMedia.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook">
                  <Facebook className="h-6 w-6 hover:opacity-80 transition" />
                </a>
              )}
              {socialMedia.instagram && (
                <a href={socialMedia.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                  <Instagram className="h-6 w-6 hover:opacity-80 transition" />
                </a>
              )}
              {socialMedia.twitter && (
                <a href={socialMedia.twitter} target="_blank" rel="noopener noreferrer" aria-label="Twitter">
                  <Twitter className="h-6 w-6 hover:opacity-80 transition" />
                </a>
              )}
              {socialMedia.linkedin && (
                <a href={socialMedia.linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
                  <Linkedin className="h-6 w-6 hover:opacity-80 transition" />
                </a>
              )}
              {socialMedia.youtube && (
                <a href={socialMedia.youtube} target="_blank" rel="noopener noreferrer" aria-label="YouTube">
                  <Youtube className="h-6 w-6 hover:opacity-80 transition" />
                </a>
              )}
            </div>
          </motion.div>
        )}

        {/* Section Avis clients (conditionnelle) */}
        {showTestimonials && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 mb-4">
                <ThumbsUp className="h-5 w-5" style={{ color: couleurPrimaire }} />
                <h3 className="text-lg font-semibold">Avis clients</h3>
              </div>
              
              <motion.button
                onClick={() => setShowAvisForm(!showAvisForm)}
                className="flex items-center justify-between px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  backgroundColor: couleurPrimaire || '#3B82F6',
                  color: 'white'
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <span>Donner votre avis</span>
                {showAvisForm ? (
                  <ChevronUp className="h-4 w-4 ml-2" />
                ) : (
                  <ChevronDown className="h-4 w-4 ml-2" />
                )}
              </motion.button>

              {showAvisForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className="mt-4">
                    <AvisClientForm 
                      companyId={companyId}
                      primaryColor={couleurPrimaire || '#3B82F6'}
                      onSuccess={() => setShowAvisForm(false)}
                    />
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {/* Mentions légales (conditionnelle) */}
      {(showLegalLinks || customLinks?.length > 0) && (
        <div 
          className="border-t py-6 text-center text-sm"
          style={{ borderColor: couleurPrimaire ? `${couleurPrimaire}20` : '#e2e8f0' }}
        >
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex flex-wrap justify-center gap-4 mb-2">
              {showLegalLinks && (
                <>
                  <a href={`/compagnie/${slug}/mentions-legales`} className="hover:underline">
                    Mentions légales
                  </a>
                  <a href={`/compagnie/${slug}/confidentialite`} className="hover:underline">
                    Politique de confidentialité
                  </a>
                  <a href={`/compagnie/${slug}/cgu`} className="hover:underline">
                    Conditions générales
                  </a>
                  <a href={`/compagnie/${slug}/cookies`} className="hover:underline">
                    Politique des cookies
                  </a>
                </>
              )}
              {customLinks?.map((link: { label: string; url: string; external?: boolean }, index: number) => (
                <a 
                  key={index} 
                  href={link.url} 
                  className="hover:underline"
                  target={link.external ? '_blank' : '_self'}
                  rel={link.external ? 'noopener noreferrer' : ''}
                >
                  {link.label}
                </a>
              ))}
            </div>
            <p>© {currentYear} {nom || 'Notre Compagnie'}. Tous droits réservés.</p>
          </div>
        </div>
      )}
    </footer>
  );
};

export default Footer;