import React from "react";
import SectionTitle from "@/components/ui/SectionTitle";
import { UserCircle2 } from "lucide-react";

const ORANGE = "#FF6600";

const TESTIMONIALS = [
  {
    name: "Fatoumata",
    text: "Teliya m’a permis d’économiser sur mes trajets. Réservation facile et rapide !",
    city: "Bamako",
  },
  {
    name: "Jean-Paul",
    text: "Service client impeccable. On m’a aidé à modifier ma réservation sans stress.",
    city: "Abidjan",
  },
  {
    name: "Aminata",
    text: "Très bon service ! Les compagnies partenaires sont sérieuses et ponctuelles.",
    city: "Dakar",
  },
  {
    name: "Moussa",
    text: "J’ai réservé pour mes parents sans difficulté. Interface claire et pratique.",
    city: "Ouagadougou",
  },
];

const TestimonialsSection: React.FC = () => {
  return (
    <section className="relative py-10 md:py-14 bg-white dark:bg-gray-950">
      {/* Fondu doux entre sections */}
      <div className="absolute -top-6 left-0 right-0 pointer-events-none select-none" aria-hidden>
        <svg viewBox="0 0 1440 60" width="100%" height="60">
          <path
            d="M0,40 C240,80 480,0 720,30 C960,60 1200,10 1440,40 L1440,60 L0,60 Z"
            fill="rgba(255,102,0,0.08)"
          />
        </svg>
      </div>

      <div className="max-w-6xl mx-auto px-4 text-center">
        <SectionTitle className="mb-8">Ils nous font confiance</SectionTitle>

        {/* Grille d’avis : 1 → 2 → 3 → 4 colonnes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 text-left">
          {TESTIMONIALS.map((t, idx) => (
            <div
              key={idx}
              className="
                bg-white/90 dark:bg-gray-900/80 backdrop-blur
                border border-orange-200/60 dark:border-orange-400/20
                rounded-2xl shadow-[0_8px_24px_rgba(0,0,0,0.05)]
                p-5 hover:shadow-md transition-shadow
              "
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="h-10 w-10 rounded-full grid place-items-center text-white shadow-sm"
                  style={{ background: ORANGE }}
                >
                  <UserCircle2 className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">{t.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t.city}</p>
                </div>
              </div>

              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                “{t.text}”
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
