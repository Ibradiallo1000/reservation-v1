// FeaturesSection.tsx (remplace tout le fichier existant)

import React from "react";
import { ShieldCheck, Zap, MapPin, CreditCard } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const ORANGE = "#FF6600";

/* =============================================
   CONTENU : 4 raisons de faire confiance à Teliya
   ============================================= */
const ITEMS = [
  {
    icon: MapPin,
    title: "Réseau local de confiance",
    text: "Nous travaillons avec des compagnies reconnues de votre région pour des trajets interurbains fiables.",
  },
  {
    icon: Zap,
    title: "Réservation rapide",
    text: "Choisissez la compagnie, l’horaire et réservez en quelques secondes — sans appels ni files d’attente.",
  },
  {
    icon: CreditCard,
    title: "Paiements sécurisés",
    text: "Moyens de paiement adaptés (mobile money, carte) et suivi automatique de votre réservation.",
  },
  {
    icon: ShieldCheck,
    title: "Confirmation & assistance",
    text: "Notifications claires, reçu de réservation et support en cas de changement ou d’imprévu.",
  },
];

const FeaturesSection: React.FC = () => {
  const [idx, setIdx] = React.useState(0);

  // Rotation auto (4,5 s)
  React.useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % ITEMS.length), 4500);
    return () => clearInterval(id);
  }, []);

  const item = ITEMS[idx];
  const Icon = item.icon;

  return (
    <section className="mx-auto max-w-4xl px-1 relative mt-1">
      {/* séparateur doux avec la section précédente (même principe que PartnersSection) */}
      <div className="absolute -top-6 left-0 right-0 pointer-events-none select-none">
        <svg viewBox="0 0 1440 60" width="100%" height="60" aria-hidden="true">
          <path
            d="M0,40 C240,80 480,0 720,30 C960,60 1200,10 1440,40 L1440,60 L0,60 Z"
            fill="rgba(255,102,0,0.08)"
          />
        </svg>
      </div>

      {/* ----- Carte principale alignée au style PartnersSection ----- */}
      <div
        className="
          rounded-3xl overflow-hidden
          border border-orange-200/60 dark:border-orange-400/25
          bg-white/80 dark:bg-gray-900/70 backdrop-blur
          shadow-[0_12px_30px_rgba(0,0,0,0.08)]
          ring-1 ring-orange-500/10
        "
      >
        {/* barre dégradée comme en haut de PartnersSection */}
        <div className="h-2 bg-gradient-to-r from-orange-500 via-amber-400 to-orange-500" />

        <div className="px-5 sm:px-8 pt-6 pb-8 text-center">
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 dark:text-white">
            Pourquoi nous faire confiance ?
          </h2>
          <p className="mt-1 text-sm text-orange-600 dark:text-orange-400">
            Teliya regroupe les compagnies locales pour vous simplifier chaque trajet.
          </p>

          {/* Carte interne avec animation (contenu qui change) */}
          <div
            className="
              mt-6 relative overflow-hidden rounded-2xl
              bg-white dark:bg-gray-900
              border border-orange-100/70 dark:border-orange-400/20
              shadow-sm
            "
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={idx}
                initial={{ y: -30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 30, opacity: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="p-6 md:p-8"
              >
                <div className="flex items-center justify-center gap-3 mb-3">
                  <span
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: "rgba(255,102,0,0.10)",
                      color: ORANGE,
                    }}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white">
                    {item.title}
                  </div>
                </div>

                <p className="text-sm md:text-base text-gray-700 dark:text-gray-300 max-w-xl mx-auto leading-relaxed">
                  {item.text}
                </p>

                {/* points de navigation */}
                <div className="mt-6 flex justify-center gap-1.5">
                  {ITEMS.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setIdx(i)}
                      className={`h-1.5 rounded-full transition-all ${
                        i === idx ? "w-6 bg-orange-600" : "w-3 bg-gray-300 dark:bg-gray-700"
                      }`}
                      aria-label={`Aller à la carte ${i + 1}`}
                    />
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
