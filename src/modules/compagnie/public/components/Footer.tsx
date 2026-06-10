import React, { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Facebook,
  Info,
  Instagram,
  Linkedin,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Send,
  Twitter,
  Youtube,
} from "lucide-react";
import { Company } from "@/types/companyTypes";
import AvisClientForm from "@/shared/ui/AvisClientForm";
import { useTranslation } from "react-i18next";

interface FooterProps {
  company: Company;
}

const Footer: React.FC<FooterProps> = ({ company }) => {
  const [showAvisForm, setShowAvisForm] = useState(false);
  const { t, i18n } = useTranslation();
  const isEn = i18n.language?.startsWith("en") ?? false;
  const currentYear = new Date().getFullYear();

  const {
    id: companyId,
    slug,
    nom,
    couleurPrimaire = "var(--public-primary)",
    couleurSecondaire = "var(--public-secondary)",
    email,
    telephone,
    adresse,
    horaires,
    socialMedia = {},
    footerConfig = {},
    about,
  } = company;

  const {
    showAbout = true,
    showContact = true,
    showSocial = true,
    showTestimonials = true,
    showLegalLinks = true,
    customLinks = [],
  } = footerConfig;

  const aboutText = (() => {
    const raw =
      (isEn ? about?.descriptionEn?.trim() : about?.description?.trim()) ||
      t("defaultAbout");
    if (!raw || raw.length <= 190) return raw;
    return `${raw.slice(0, 190).trim()}…`;
  })();

  const contactRows = [
    telephone && { label: telephone, href: `tel:${telephone}`, icon: Phone },
    email && { label: email, href: `mailto:${email}`, icon: Mail },
    adresse && {
      label: adresse,
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`,
      icon: MapPin,
    },
    horaires && { label: horaires, icon: Clock },
  ].filter(Boolean) as { label: string; href?: string; icon: React.ElementType }[];

  return (
    <footer className="relative z-10 w-full text-white">
      <div className="public-premium-container px-4 pb-10 pt-8 sm:px-6 sm:pb-14 sm:pt-12">
        <div className="grid gap-5 lg:grid-cols-2">
          {showAbout && (
            <motion.section
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="public-premium-glass-dark rounded-[1.75rem] p-7 sm:p-10"
            >
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10">
                  <Info className="h-5 w-5" style={{ color: couleurSecondaire }} />
                </span>
                <h3 className="text-2xl font-extrabold tracking-tight">{t("about")}</h3>
              </div>
              <p className="line-clamp-4 text-sm leading-7 text-white/75 sm:text-base sm:leading-8">
                {aboutText}
              </p>
              <Link
                to={`/${slug}/a-propos`}
                className="mt-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/15"
              >
                {t("learnMore")}
                <ChevronRight className="h-4 w-4" />
              </Link>
            </motion.section>
          )}

          {showContact && contactRows.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="public-premium-glass-dark rounded-[1.75rem] p-6 sm:p-8"
            >
              <div className="mb-4 flex items-center gap-3">
                <Phone className="h-5 w-5" style={{ color: couleurSecondaire }} />
                <h3 className="text-xl font-extrabold">{t("contact")}</h3>
              </div>
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
                {contactRows.map(({ label, href, icon: Icon }, index) => {
                  const content = (
                    <>
                      <Icon className="h-5 w-5 shrink-0" style={{ color: couleurSecondaire }} />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{label}</span>
                      {href && (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
                          <Send className="h-4 w-4" style={{ color: couleurSecondaire }} />
                        </span>
                      )}
                    </>
                  );
                  const className = `flex min-h-16 items-center gap-3 px-4 ${index > 0 ? "border-t border-white/10" : ""}`;
                  return href ? (
                    <a key={label} href={href} className={className} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
                      {content}
                    </a>
                  ) : (
                    <div key={label} className={className}>{content}</div>
                  );
                })}
              </div>
            </motion.section>
          )}
        </div>

        {showTestimonials && (
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-5"
          >
            <motion.button
              onClick={() => setShowAvisForm(!showAvisForm)}
              className="public-premium-gradient flex min-h-16 w-full items-center gap-3 rounded-2xl px-5 text-left text-base font-extrabold text-white shadow-2xl sm:px-7 sm:text-lg"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.99 }}
            >
              <MessageCircle className="h-6 w-6" />
              <span className="flex-1">{t("leaveReview")}</span>
              {showAvisForm ? <ChevronUp /> : <ChevronDown />}
            </motion.button>
            {showAvisForm && (
              <div className="public-premium-glass-dark mt-4 rounded-[1.75rem] p-5">
                <AvisClientForm companyId={companyId} primaryColor={couleurPrimaire} />
              </div>
            )}
          </motion.section>
        )}

        {showSocial && Object.values(socialMedia).some(Boolean) && (
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {[
              [socialMedia.facebook, Facebook],
              [socialMedia.instagram, Instagram],
              [socialMedia.twitter, Twitter],
              [socialMedia.linkedin, Linkedin],
              [socialMedia.youtube, Youtube],
            ].map(([url, Icon], index) =>
              url ? (
                <a
                  key={index}
                  href={String(url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/15"
                >
                  <Icon className="h-5 w-5" />
                </a>
              ) : null
            )}
          </div>
        )}

        {(showLegalLinks || customLinks.length > 0) && (
          <div className="mt-10 border-t border-white/10 pt-7 text-center text-xs text-white/45 sm:text-sm">
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-3">
              {showLegalLinks && (
                <>
                  <a href={`/${slug}/mentions-legales`}>{t("legalNotice")}</a>
                  <a href={`/${slug}/confidentialite`}>{t("privacyPolicy")}</a>
                  <a href={`/${slug}/conditions`}>{t("termsConditions")}</a>
                  <a href={`/${slug}/cookies`}>{t("cookiePolicy")}</a>
                </>
              )}
              {customLinks.map((link, index) => (
                <a key={index} href={link.url} target={link.external ? "_blank" : "_self"} rel={link.external ? "noopener noreferrer" : ""}>
                  {link.label}
                </a>
              ))}
            </div>
            <p className="mt-5">© {currentYear} {nom || t("ourCompany")} — {t("allRightsReserved")}</p>
          </div>
        )}
      </div>
    </footer>
  );
};

export default Footer;
