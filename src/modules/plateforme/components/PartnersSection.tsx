import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where, limit } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { Link } from "react-router-dom";

const ORANGE = "#FF6600";

type Company = {
  id: string;
  nom: string;
  slug?: string;
  status?: "actif" | "inactif";
  publicPageEnabled?: boolean;
  logoUrl?: string;
};

const PartnersSection: React.FC = () => {
  const [companies, setCompanies] = useState<Company[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const q = query(
          collection(db, "companies"),
          where("publicPageEnabled", "==", true),
          where("status", "==", "actif"),
          limit(24)
        );
        const snap = await getDocs(q);
        if (!cancelled) {
          setCompanies(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Company[]
          );
        }
      } catch {
        if (!cancelled) setCompanies([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const visible = (companies || []).slice(0, 12);

  return (
    // remonte sous le hero
    <section className="-mt-12 md:-mt-16 mx-auto max-w-6xl px-0 relative">
      {/* --- séparateur doux entre le hero et la section (pas de nouveau fichier) --- */}
      <div className="absolute -top-6 left-0 right-0 pointer-events-none select-none">
        <svg viewBox="0 0 1440 60" width="100%" height="60" aria-hidden="true">
          <path
            d="M0,40 C240,80 480,0 720,30 C960,60 1200,10 1440,40 L1440,60 L0,60 Z"
            fill="rgba(255,102,0,0.08)" /* orange très léger */
          />
        </svg>
      </div>

      {/* --- carte principale --- */}
      <div
        className="
          rounded-3xl overflow-hidden
          border border-orange-200/60 dark:border-orange-400/25
          bg-white/80 dark:bg-gray-900/70 backdrop-blur
          shadow-[0_12px_30px_rgba(0,0,0,0.08)]
          ring-1 ring-orange-500/10
        "
      >
        {/* barre dégradée orange en haut */}
        <div className="h-2 bg-gradient-to-r from-orange-500 via-amber-400 to-orange-500" />

        <div className="px-0 sm:px-8 pt-6 pb-8">
          {/* Titre centré */}
          <div className="text-center">
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
              Choisissez votre compagnie
            </h2>
            <p className="text-sm text-orange-600 dark:text-orange-400 mt-1">
              Cliquez sur un logo pour ouvrir la vitrine et réserver.
            </p>

            {companies && companies.length > visible.length && (
              <div className="mt-2">
                <Link
                  to="/compagnies"
                  className="text-sm font-semibold text-orange-600 hover:text-orange-700"
                >
                  Voir plus →
                </Link>
              </div>
            )}
          </div>

          {/* Grille centrée */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6 justify-items-center">
            {companies === null ? (
              Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="w-full">
                  <div className="mx-auto w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
                  <div className="h-3 w-20 mx-auto mt-2 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
                </div>
              ))
            ) : visible.length === 0 ? (
              <p className="col-span-full text-center text-gray-500 dark:text-gray-400">
                Aucune compagnie partenaire pour le moment.
              </p>
            ) : (
              visible.map((c) => {
                const Card = (
                  <div
                    className="group w-full max-w-[11rem] text-center p-2 rounded-2xl
                               border border-orange-100/70 dark:border-orange-400/20
                               bg-white dark:bg-gray-900
                               shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div
                      className="mx-auto rounded-full overflow-hidden mb-2 border-2
                                 transition-transform duration-200 group-hover:scale-105"
                      style={{
                        borderColor: ORANGE,
                        boxShadow: "0 0 4px rgba(255,102,0,0.45)",
                        width: "clamp(80px, 24vw, 96px)",
                        height: "clamp(80px, 24vw, 96px)",
                      }}
                    >
                      <img
                        src={c.logoUrl || "/images/partner-placeholder.png"}
                        alt={c.nom}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src =
                            "/images/partner-placeholder.png";
                        }}
                      />
                    </div>

                    <div
                      className="text-[13px] sm:text-[14px] font-semibold truncate"
                      style={{ color: ORANGE }}
                      title={c.nom}
                    >
                      {c.nom}
                    </div>
                  </div>
                );

                return c.slug?.trim() ? (
                  <Link
                    key={c.id}
                    to={`/${c.slug}`}
                    className="focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-orange-500 dark:focus-visible:ring-offset-gray-900 rounded-2xl"
                  >
                    {Card}
                  </Link>
                ) : (
                  <div key={c.id} aria-disabled="true" title="Page indisponible">
                    {Card}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default PartnersSection;
