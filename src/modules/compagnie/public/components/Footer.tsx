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
  Scale,
  Send,
  Share2,
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
    const raw = isEn ? about?.descriptionEn?.trim() : about?.description?.trim();
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
    <footer className="relative z-10 w-full rounded-t-[2rem] border-t border-[var(--public-line)] bg-[var(--public-surface)] text-[var(--public-ink)] shadow-[0_-18px_50px_color-mix(in_srgb,var(--public-primary)_10%,transparent)] sm:rounded-t-[2.75rem]">
      <div className="public-premium-container px-3 pb-8 pt-6 sm:px-6 sm:pb-10 sm:pt-9">
        <div className="grid gap-4 lg:grid-cols-2">
          {showAbout && aboutText && (
            <motion.section
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="public-premium-card p-5 sm:p-6"
            >
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--public-primary-soft)]">
                  <Info className="h-5 w-5" style={{ color: couleurSecondaire }} />
                </span>
                <h3 className="text-lg font-extrabold tracking-tight sm:text-xl">{t("about")}</h3>
              </div>
              <p className="line-clamp-4 text-sm leading-6 text-[var(--public-muted)]">
                {aboutText}
              </p>
              <Link
                to={`/${slug}/a-propos`}
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--public-line)] bg-[var(--public-primary-soft)] px-4 py-2 text-xs font-bold transition hover:-translate-y-0.5"
                style={{ color: couleurPrimaire }}
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
              className="public-premium-card p-5 sm:p-6"
            >
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--public-secondary-soft)]">
                  <Phone className="h-5 w-5" style={{ color: couleurSecondaire }} />
                </span>
                <h3 className="text-lg font-extrabold sm:text-xl">{t("contact")}</h3>
              </div>
              <div className="overflow-hidden rounded-2xl border border-[var(--public-line)] bg-[var(--public-surface)]">
                {contactRows.map(({ label, href, icon: Icon }, index) => {
                  const content = (
                    <>
                      <Icon className="h-5 w-5 shrink-0" style={{ color: couleurSecondaire }} />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{label}</span>
                      {href && (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--public-secondary-soft)]">
                          <Send className="h-4 w-4" style={{ color: couleurSecondaire }} />
                        </span>
                      )}
                    </>
                  );
                  const className = `flex min-h-14 items-center gap-3 px-4 ${index > 0 ? "border-t border-[var(--public-line)]" : ""}`;
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
            className="public-premium-card mt-4 p-4 sm:p-5"
          >
            <motion.button
              onClick={() => setShowAvisForm(!showAvisForm)}
              className="public-premium-gradient flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-left text-sm font-extrabold text-white shadow-md sm:px-5 sm:text-base"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.99 }}
            >
              <MessageCircle className="h-6 w-6" />
              <span className="flex-1">{t("leaveReview")}</span>
              {showAvisForm ? <ChevronUp /> : <ChevronDown />}
            </motion.button>
            {showAvisForm && (
              <div className="mt-4 rounded-2xl border border-[var(--public-line)] bg-[var(--public-surface)] p-4">
                <AvisClientForm companyId={companyId} primaryColor={couleurPrimaire} />
              </div>
            )}
          </motion.section>
        )}

        {showSocial && Object.values(socialMedia).some(Boolean) && (
          <div className="public-premium-card mt-4 p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--public-primary-soft)]">
                <Share2 className="h-5 w-5" style={{ color: couleurPrimaire }} />
              </span>
              <h3 className="text-lg font-extrabold">{t("followUs")}</h3>
            </div>
            <div className="flex flex-wrap gap-2.5">
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
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--public-line)] bg-[var(--public-surface)] transition hover:-translate-y-0.5"
                    style={{ color: couleurPrimaire }}
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                ) : null
              )}
            </div>
          </div>
        )}

        {(showLegalLinks || customLinks.length > 0) && (
          <div className="public-premium-card mt-4 p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--public-secondary-soft)]">
                <Scale className="h-5 w-5" style={{ color: couleurSecondaire }} />
              </span>
              <h3 className="text-lg font-extrabold">{t("legalLinks")}</h3>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-[var(--public-muted)] sm:text-sm">
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
          </div>
        )}

        <div className="mt-6 border-t border-[var(--public-line)] pt-5 text-center text-xs text-[var(--public-muted)]">
          <p>© {currentYear} {nom || t("ourCompany")} — {t("allRightsReserved")}</p>
          <p className="mt-1 text-[11px] opacity-75">{t("poweredByTeliya")}</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
