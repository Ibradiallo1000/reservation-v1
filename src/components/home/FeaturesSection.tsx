import React from "react";
import { ShieldCheck, Zap, MapPin, CreditCard } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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

/* =============================================
   Composant principal
   ============================================= */
const FeaturesSection: React.FC = () => {
  const [idx, setIdx] = React.useState(0);

  // Rotation automatique (4,5 secondes)
  React.useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % ITEMS.length), 4500);
    return () => clearInterval(id);
  }, []);

  const item = ITEMS[idx];
  const Icon = item.icon;

  return (
    <div className="mx-auto max-w-3xl px-4 text-center">
      <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 dark:text-white">
        Pourquoi nous faire confiance ?
      </h2>
      <p className="mt-1 text-sm text-orange-600 dark:text-orange-400">
        Teliya regroupe les compagnies locales pour vous simplifier chaque trajet.
      </p>

      {/* Carte principale avec transition douce */}
      <div className="mt-6 relative overflow-hidden rounded-2xl bg-white dark:bg-gray-900 border border-black/5 dark:border-white/10 shadow-md">
        <AnimatePresence mode="wait">
          <motion.div
            key={idx}
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="p-6 md:p-8"
          >
            <div className="flex items-center justify-center gap-3 mb-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-300">
                <Icon className="h-5 w-5" />
              </span>
              <div className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white">
                {item.title}
              </div>
            </div>

            <p className="text-sm md:text-base text-gray-700 dark:text-gray-300 max-w-xl mx-auto leading-relaxed">
              {item.text}
            </p>

            {/* Petits points de navigation */}
            <div className="mt-6 flex justify-center gap-1.5">
              {ITEMS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === idx
                      ? "w-6 bg-orange-600"
                      : "w-3 bg-gray-300 dark:bg-gray-700"
                  }`}
                  aria-label={`Aller à la carte ${i + 1}`}
                />
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default FeaturesSection;
