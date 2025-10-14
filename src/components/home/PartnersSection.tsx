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
        if (!cancelled)
          setCompanies(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Company[]);
      } catch {
        if (!cancelled) setCompanies([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = (companies || []).slice(0, 12);

  return (
    <section className="mx-auto max-w-6xl px-4 pt-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 dark:text-white">
            Choisissez votre compagnie
          </h2>
          <p className="text-sm text-orange-600 dark:text-orange-400 mt-1">
            Cliquez sur un logo pour ouvrir la vitrine et réserver.
          </p>
        </div>
        {companies && companies.length > visible.length && (
          <Link
            to="/compagnies"
            className="text-sm font-semibold text-orange-600 hover:text-orange-700"
          >
            Voir plus →
          </Link>
        )}
      </div>

      {/* ✅ Grille responsive : 2 / 3 / 4 colonnes */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {companies === null ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="text-center">
              <div className="w-20 h-20 mx-auto rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
              <div className="h-3 w-20 mx-auto mt-2 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
            </div>
          ))
        ) : visible.length === 0 ? (
          <p className="col-span-full text-center text-gray-500 dark:text-gray-400">
            Aucune compagnie partenaire pour le moment.
          </p>
        ) : (
          visible.map((c) => {
            const Inner = (
              <div className="group text-center p-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition">
                {/* ✅ Logo avec bordure orange, plus grand sur mobile */}
                <div
                  className="mx-auto rounded-full overflow-hidden shadow-sm mb-2 border-2 transition-transform duration-200 group-hover:scale-105"
                  style={{
                    borderColor: ORANGE,
                    boxShadow: "0 0 4px rgba(255,102,0,0.5)",
                    width: "clamp(80px, 25vw, 100px)",
                    height: "clamp(80px, 25vw, 100px)",
                  }}
                >
                  <img
                    src={c.logoUrl || "/images/partner-placeholder.png"}
                    alt={c.nom}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                    onError={(e) =>
                      ((e.currentTarget as HTMLImageElement).src =
                        "/images/partner-placeholder.png")
                    }
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
                className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              >
                {Inner}
              </Link>
            ) : (
              <div key={c.id} aria-disabled="true" title="Page indisponible">
                {Inner}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};

export default PartnersSection;
