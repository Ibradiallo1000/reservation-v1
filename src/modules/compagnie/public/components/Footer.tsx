import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Mail, Phone, MapPin, Clock, Info, ThumbsUp,
  Facebook, Instagram, Twitter, Linkedin, Youtube,
  ChevronDown, ChevronUp
} from 'lucide-react';
import { Company } from '@/types/companyTypes';
import AvisClientForm from '@/shared/ui/AvisClientForm';
import { useTranslation } from 'react-i18next';

interface FooterProps {
  company: Company;
}

const Footer: React.FC<FooterProps> = ({ company }) => {
  const [showAvisForm, setShowAvisForm] = useState(false);
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();

  const {
    id: companyId,
    slug,
    nom,
    couleurPrimaire = '#3B82F6',
    couleurSecondaire = '#22D3EE',
    description,
    email,
    telephone,
    adresse,
    horaires,
    socialMedia = {},
    footerConfig = {}
  } = company;

  const {
    showAbout = true,
    showContact = true,
    showSocial = true,
    showTestimonials = true,
    showLegalLinks = true,
    customLinks = []
  } = footerConfig;

  return (
    <footer
      className="relative w-full overflow-hidden text-white"
      style={{
        background: 'linear-gradient(180deg, #0f172a 0%, #0b1220 100%)'
      }}
    >
      {/* Glow subtil en haut */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{
          background: `linear-gradient(90deg, ${couleurPrimaire}, ${couleurSecondaire})`
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">

        {/* À propos */}
        {showAbout && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Info className="h-5 w-5" style={{ color: couleurSecondaire }} />
              <h3 className="text-lg font-semibold tracking-wide">
                {t('about')}
              </h3>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">
              {description || t('defaultAbout')}
            </p>
          </motion.div>
        )}

        {/* Contact */}
        {showContact && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Phone className="h-5 w-5" style={{ color: couleurSecondaire }} />
              <h3 className="text-lg font-semibold tracking-wide">
                {t('contact')}
              </h3>
            </div>
            <ul className="space-y-3 text-sm text-gray-300">
              {telephone && (
                <li className="flex items-center gap-2 hover:text-white transition">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <a href={`tel:${telephone}`}>{telephone}</a>
                </li>
              )}
              {email && (
                <li className="flex items-center gap-2 hover:text-white transition">
                  <Mail className="h-4 w-4 text-gray-400" />
                  <a href={`mailto:${email}`}>{email}</a>
                </li>
              )}
              {adresse && (
                <li className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-gray-400" />
                  {adresse}
                </li>
              )}
              {horaires && (
                <li className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-400" />
                  {horaires}
                </li>
              )}
            </ul>
          </motion.div>
        )}

        {/* Réseaux sociaux */}
        {showSocial && Object.values(socialMedia).some(Boolean) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <ThumbsUp className="h-5 w-5" style={{ color: couleurSecondaire }} />
              <h3 className="text-lg font-semibold tracking-wide">
                {t('followUs')}
              </h3>
            </div>
            <div className="flex gap-4">
              {socialMedia.facebook && (
                <a href={socialMedia.facebook} target="_blank" rel="noopener noreferrer" className="hover:scale-110 transition">
                  <Facebook className="h-6 w-6 text-gray-300 hover:text-white" />
                </a>
              )}
              {socialMedia.instagram && (
                <a href={socialMedia.instagram} target="_blank" rel="noopener noreferrer" className="hover:scale-110 transition">
                  <Instagram className="h-6 w-6 text-gray-300 hover:text-white" />
                </a>
              )}
              {socialMedia.twitter && (
                <a href={socialMedia.twitter} target="_blank" rel="noopener noreferrer" className="hover:scale-110 transition">
                  <Twitter className="h-6 w-6 text-gray-300 hover:text-white" />
                </a>
              )}
              {socialMedia.linkedin && (
                <a href={socialMedia.linkedin} target="_blank" rel="noopener noreferrer" className="hover:scale-110 transition">
                  <Linkedin className="h-6 w-6 text-gray-300 hover:text-white" />
                </a>
              )}
              {socialMedia.youtube && (
                <a href={socialMedia.youtube} target="_blank" rel="noopener noreferrer" className="hover:scale-110 transition">
                  <Youtube className="h-6 w-6 text-gray-300 hover:text-white" />
                </a>
              )}
            </div>
          </motion.div>
        )}

        {/* Avis clients */}
        {showTestimonials && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <ThumbsUp className="h-5 w-5" style={{ color: couleurSecondaire }} />
              <h3 className="text-lg font-semibold tracking-wide">
                {t('customerReviews')}
              </h3>
            </div>

            <motion.button
              onClick={() => setShowAvisForm(!showAvisForm)}
              className="w-full flex items-center justify-between px-5 py-3 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: `linear-gradient(135deg, ${couleurPrimaire}, ${couleurSecondaire})`,
                boxShadow: `0 10px 25px ${couleurPrimaire}40`
              }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <span>{t('leaveReview')}</span>
              {showAvisForm ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </motion.button>

            {showAvisForm && (
              <div className="mt-5">
                <AvisClientForm
                  companyId={companyId}
                  primaryColor={couleurPrimaire}
                />
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* Section légale */}
      {(showLegalLinks || customLinks.length > 0) && (
        <div className="border-t border-white/10 mt-8 pt-6 pb-8 text-center text-sm text-gray-400">
          <div className="max-w-7xl mx-auto px-6 space-y-4">

            <div className="flex flex-wrap justify-center gap-5">
              {showLegalLinks && (
                <>
                  <a href={`/${slug}/mentions-legales`} className="hover:text-white transition">
                    {t('legalNotice')}
                  </a>
                  <a href={`/${slug}/confidentialite`} className="hover:text-white transition">
                    {t('privacyPolicy')}
                  </a>
                  <a href={`/${slug}/conditions`} className="hover:text-white transition">
                    {t('termsConditions')}
                  </a>
                  <a href={`/${slug}/cookies`} className="hover:text-white transition">
                    {t('cookiePolicy')}
                  </a>
                </>
              )}

              {customLinks.map((link, index) => (
                <a
                  key={index}
                  href={link.url}
                  target={link.external ? '_blank' : '_self'}
                  rel={link.external ? 'noopener noreferrer' : ''}
                  className="hover:text-white transition"
                >
                  {link.label}
                </a>
              ))}
            </div>

            <p className="text-gray-500">
              © {currentYear} {nom || t('ourCompany')} — {t('allRightsReserved')}
            </p>
          </div>
        </div>
      )}
    </footer>
  );
};

export default Footer;
