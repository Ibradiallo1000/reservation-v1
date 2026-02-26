// src/components/home/Footer.tsx
import React, { useEffect, useState } from "react";
import {
  Info, MessageCircle, Phone, Mail, MapPin, Clock,
  ThumbsUp, Facebook, Instagram, Twitter, Linkedin, Youtube,
} from "lucide-react";
import { db } from "@/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import { Link } from "react-router-dom";

const ORANGE = "#FF6600";
const ORANGE_DARK = "#E55400";

type SocialLinks = {
  facebook?: string;
  instagram?: string;
  twitter?: string;
  linkedin?: string;
  youtube?: string;
};

type ContactInfo = {
  phone?: string;
  email?: string;
  address?: string;
  hours?: string;
};

type NavLink = {
  label: string;
  url: string;         // peut être /route-interne ou https://externe
  external?: boolean;  // true = target=_blank
};

type PlatformSettings = {
  platformName?: string;    // "Teliya"
  slogan?: string;          // "Réserver simplement, voyager sereinement."
  country?: string;         // "Mali"
  about?: string;           // texte "À propos"
  contact?: ContactInfo;
  social?: SocialLinks;
  legalLinks?: NavLink[];   // Mentions, confidentialité, CGU, cookies...
  extraLinks?: NavLink[];   // Aide, Partenaires, Blog, etc.
  worldMapBg?: boolean;     // activer/désactiver motif de fond
};

const Footer: React.FC = () => {
  const [s, setS] = useState<PlatformSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "platform", "settings"));
        const data = (snap.exists() ? (snap.data() as any) : {}) as PlatformSettings;
        if (!cancelled) setS(data);
      } catch {
        if (!cancelled) setS({});
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const year = new Date().getFullYear();
  const platformName = s?.platformName || "Teliya";
  const slogan = s?.slogan || "Réserver simplement, voyager sereinement.";
  const country = s?.country || "Mali";
  const aboutText =
    s?.about ||
    `Plateforme développée au ${country}. Nous simplifions la réservation des billets
     interurbains avec des compagnies partenaires vérifiées, des paiements fiables et un suivi clair.`;

  const c = s?.contact || {};
  const social = s?.social || {};
  const legalLinks = s?.legalLinks || [];
  const extraLinks = s?.extraLinks || [];

  const renderLink = (l: NavLink) =>
    l.external ? (
      <a
        key={l.label}
        href={l.url}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:underline underline-offset-2"
      >
        {l.label}
      </a>
    ) : l.url.startsWith("/") ? (
      <Link key={l.label} to={l.url} className="hover:underline underline-offset-2">
        {l.label}
      </Link>
    ) : (
      <a key={l.label} href={l.url} className="hover:underline underline-offset-2">
        {l.label}
      </a>
    );

  return (
    <footer className="relative w-full overflow-hidden text-white">
      {/* Fond orange (dégradé subtil) */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${ORANGE} 0%, ${ORANGE_DARK} 100%)`,
        }}
      />

      {/* Motif optionnel façon “world map” (très léger) */}
      {s?.worldMapBg !== false && (
        <div
          className="absolute inset-0 bg-[url('/world-map.svg')] bg-center bg-cover opacity-[0.06] pointer-events-none"
          aria-hidden
        />
      )}

      {/* Contenu */}
      <div className="relative z-10">
        {/* bande supérieure fine pour relief */}
        <div className="h-1 w-full bg-white/10" />

        <div className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* À propos */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Info className="h-5 w-5 text-white" />
              <h3 className="text-lg font-semibold">À propos</h3>
            </div>
            <p className="text-sm text-white/90 leading-relaxed">{aboutText}</p>
          </div>

          {/* Contact */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <MessageCircle className="h-5 w-5 text-white" />
              <h3 className="text-lg font-semibold">Contact</h3>
            </div>
            <ul className="space-y-2 text-sm">
              {c.phone && (
                <li className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-white/90" />
                  <a href={`tel:${c.phone}`} className="hover:underline underline-offset-2">
                    {c.phone}
                  </a>
                </li>
              )}
              {c.email && (
                <li className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-white/90" />
                  <a href={`mailto:${c.email}`} className="hover:underline underline-offset-2">
                    {c.email}
                  </a>
                </li>
              )}
              {c.address && (
                <li className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-white/90" />
                  <span className="text-white/90">{c.address}</span>
                </li>
              )}
              {c.hours && (
                <li className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-white/90" />
                  <span className="text-white/90">{c.hours}</span>
                </li>
              )}
            </ul>
          </div>

          {/* Réseaux sociaux */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <ThumbsUp className="h-5 w-5 text-white" />
              <h3 className="text-lg font-semibold">Nous suivre</h3>
            </div>
            <div className="flex gap-4">
              {social.facebook && (
                <a href={social.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook">
                  <Facebook className="h-6 w-6 hover:opacity-90 transition" />
                </a>
              )}
              {social.instagram && (
                <a href={social.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                  <Instagram className="h-6 w-6 hover:opacity-90 transition" />
                </a>
              )}
              {social.twitter && (
                <a href={social.twitter} target="_blank" rel="noopener noreferrer" aria-label="Twitter / X">
                  <Twitter className="h-6 w-6 hover:opacity-90 transition" />
                </a>
              )}
              {social.linkedin && (
                <a href={social.linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
                  <Linkedin className="h-6 w-6 hover:opacity-90 transition" />
                </a>
              )}
              {social.youtube && (
                <a href={social.youtube} target="_blank" rel="noopener noreferrer" aria-label="YouTube">
                  <Youtube className="h-6 w-6 hover:opacity-90 transition" />
                </a>
              )}
              {!social.facebook && !social.instagram && !social.twitter && !social.linkedin && !social.youtube && (
                <p className="text-sm text-white/70">À venir…</p>
              )}
            </div>
          </div>

          {/* Liens légaux & utiles */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Info className="h-5 w-5 text-white" />
              <h3 className="text-lg font-semibold">Liens</h3>
            </div>

            {/* Légaux */}
            {legalLinks.length > 0 && (
              <>
                <div className="text-sm font-semibold mb-1 text-white/90">Légal</div>
                <nav className="mb-4 grid grid-cols-1 gap-2 text-sm">
                  {legalLinks.map(renderLink)}
                </nav>
              </>
            )}

            {/* Utiles */}
            {extraLinks.length > 0 && (
              <>
                <div className="text-sm font-semibold mb-1 text-white/90">Utiles</div>
                <nav className="grid grid-cols-1 gap-2 text-sm">
                  {extraLinks.map(renderLink)}
                </nav>
              </>
            )}

            {legalLinks.length === 0 && extraLinks.length === 0 && (
              <p className="text-sm text-white/70">Aucun lien configuré pour le moment.</p>
            )}
          </div>
        </div>

        {/* Bas de page */}
        <div
          className="border-t border-white/15 py-6 text-center text-sm"
        >
          <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-white font-extrabold text-xl">
                {platformName} <span className="opacity-90">•</span>
              </span>
              <span className="text-white/90">{slogan}</span>
            </div>
            <div className="text-white/80">
              © {year} {platformName}. Tous droits réservés. <span className="opacity-90">Made with ♥</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
