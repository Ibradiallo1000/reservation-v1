/**
 * Footer landing — 4 colonnes : Logo+À propos+Mission | Contact | Liens | Réseaux sociaux.
 * Contenu depuis platform/settings (footer.about, footer.mission, contact, social, legalLinks).
 */
import React, { useEffect, useState } from "react";
import { Phone, Mail, Facebook, Twitter, Linkedin, Link as LinkIcon } from "lucide-react";
import { db } from "@/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

const DEFAULT_ABOUT =
  "TELIYA est une plateforme de gestion conçue pour les compagnies de transport. Elle permet de centraliser les réservations, connecter les agences, gérer l'embarquement des passagers et suivre les finances depuis une seule plateforme.";
const DEFAULT_MISSION =
  "Notre mission est de moderniser et simplifier la gestion du transport interurbain en Afrique grâce à des outils numériques fiables et accessibles.";

type SocialLinks = { facebook?: string; linkedin?: string; twitter?: string };
type NavLink = { label: string; url: string; external?: boolean };

type PlatformSettings = {
  platformName?: string;
  slogan?: string;
  about?: string;
  contact?: { phone?: string; email?: string };
  social?: SocialLinks;
  legalLinks?: NavLink[];
  footer?: { about?: string; mission?: string; contactPhone?: string; contactEmail?: string };
};

const Footer: React.FC = () => {
  const { t } = useTranslation();
  const [s, setS] = useState<PlatformSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, "platform", "settings"))
      .then((snap) => {
        if (cancelled || !snap.exists()) return;
        setS(snap.data() as PlatformSettings);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const year = new Date().getFullYear();
  const platformName = s?.platformName || "TELIYA";
  const slogan = s?.slogan || "Réserver simplement, voyager sereinement.";
  const aboutText = (s?.footer?.about ?? s?.about ?? "").trim() || DEFAULT_ABOUT;
  const missionText = (s?.footer?.mission ?? "").trim() || DEFAULT_MISSION;
  const contactPhone = (s?.footer?.contactPhone ?? s?.contact?.phone ?? "").trim();
  const contactEmail = (s?.footer?.contactEmail ?? s?.contact?.email ?? "").trim();
  const social = s?.social || {};
  const legalLinks = (s?.legalLinks?.length ? s.legalLinks : []) as NavLink[];

  const linkClass =
    "text-sm text-slate-300 dark:text-slate-400 hover:text-orange-500 dark:hover:text-orange-400 transition";

  const renderNavLink = (l: NavLink) =>
    l.external ? (
      <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
        {l.label}
      </a>
    ) : (
      <Link key={l.label} to={l.url} className={linkClass}>
        {l.label}
      </Link>
    );

  const socialItems = [
    { key: "facebook", href: social.facebook, Icon: Facebook, label: "Facebook" },
    { key: "linkedin", href: social.linkedin, Icon: Linkedin, label: "LinkedIn" },
    { key: "twitter", href: social.twitter, Icon: Twitter, label: "Twitter" },
  ].filter((item) => item.href);

  return (
    <footer className="w-full bg-slate-800 dark:bg-slate-900 text-white border-t border-slate-700 dark:border-slate-700">
      <div className="max-w-[1200px] mx-auto px-6 py-10 md:py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-10">
          {/* Colonne 1 : Logo + À propos + Mission */}
          <div className="space-y-4">
            <div className="flex items-center">
              <span className="text-xl font-extrabold text-white tracking-tight">{platformName}</span>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                {t("landing.footerSectionAbout")}
              </h3>
              <p className="text-sm text-slate-300 dark:text-slate-400 leading-relaxed">{aboutText}</p>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                {t("landing.footerSectionMission")}
              </h3>
              <p className="text-sm text-slate-300 dark:text-slate-400 leading-relaxed">{missionText}</p>
            </div>
          </div>

          {/* Colonne 2 : Contact */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-4">
              {t("landing.footerSectionContact")}
            </h3>
            <ul className="space-y-2 text-sm">
              {contactPhone && (
                <li>
                  <a href={`tel:${contactPhone}`} className={linkClass + " flex items-center gap-2"}>
                    <Phone className="h-4 w-4" /> {contactPhone}
                  </a>
                </li>
              )}
              {contactEmail && (
                <li>
                  <a href={`mailto:${contactEmail}`} className={linkClass + " flex items-center gap-2"}>
                    <Mail className="h-4 w-4" /> {contactEmail}
                  </a>
                </li>
              )}
              {!contactPhone && !contactEmail && (
                <li className="text-slate-500 text-sm">{t("landing.footerSectionContact")} — à configurer</li>
              )}
            </ul>
          </div>

          {/* Colonne 3 : Liens */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-4 flex items-center gap-2">
              <LinkIcon className="h-4 w-4" />
              {t("landing.footerSectionLinks")}
            </h3>
            <nav className="space-y-2">{legalLinks.map(renderNavLink)}</nav>
          </div>

          {/* Colonne 4 : Réseaux sociaux */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-4">
              Réseaux sociaux
            </h3>
            {socialItems.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {socialItems.map(({ href, Icon, label }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-700 dark:bg-slate-800 hover:bg-orange-500 dark:hover:bg-orange-500 text-slate-300 dark:text-slate-400 hover:text-white transition"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Liens à configurer</p>
            )}
          </div>
        </div>
      </div>

      {/* Barre du bas */}
      <div className="border-t border-slate-700 dark:border-slate-700 py-5">
        <div className="max-w-[1200px] mx-auto px-6 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-center">
          <span className="text-sm font-semibold text-white">{platformName} © {year}</span>
          <span className="text-slate-400 dark:text-slate-500 text-sm hidden sm:inline">•</span>
          <span className="text-sm text-slate-400 dark:text-slate-500">{slogan}</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
