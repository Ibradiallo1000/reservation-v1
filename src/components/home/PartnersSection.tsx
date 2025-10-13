import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where, limit } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

type Company = {
  id: string;
  nom: string;
  slug?: string;
  status?: "actif" | "inactif";
  publicPageEnabled?: boolean;
  logoUrl?: string;
  pays?: string;
};

const SkeletonCard: React.FC = () => (
  <div className="min-w-[120px] max-w-[120px] p-3" role="listitem" aria-label="Chargement">
    <div className="rounded-full w-16 h-16 mx-auto mb-2 bg-gray-200 animate-pulse" />
    <div className="h-3 w-20 mx-auto rounded bg-gray-200 animate-pulse" />
  </div>
);

function runIdle(fn: () => void) {
  const w = window as any;
  const id: number = (w.requestIdleCallback?.(() => fn()) as number) ?? window.setTimeout(fn, 1);
  return () => (w.cancelIdleCallback ? w.cancelIdleCallback(id) : clearTimeout(id));
}

const PartnersSection: React.FC = () => {
  const [companies, setCompanies] = useState<Company[] | null>(null);

  useEffect(() => {
    const cancel = runIdle(async () => {
      try {
        const q = query(
          collection(db, "companies"),
          where("publicPageEnabled", "==", true),
          where("status", "==", "actif"),
          limit(24)
        );
        const snap = await getDocs(q);
        setCompanies(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Company[]);
      } catch (e) {
        console.error("PartnersSection ► Firestore", e);
        setCompanies([]);
      }
    });
    return cancel;
  }, []);

  const preload = (url?: string) => {
    if (!url) return;
    try {
      const l = document.createElement("link");
      l.rel = "preload";
      l.as = "image";
      l.href = url;
      l.fetchPriority = "low";
      document.head.appendChild(l);
      window.setTimeout(() => {
        try { document.head.removeChild(l); } catch {}
      }, 3000);
    } catch {}
  };

  return (
    <div className="max-w-6xl mx-auto px-4">
      <div
        className="flex gap-4 overflow-x-auto py-3 snap-x snap-mandatory
                   [scrollbar-width:thin] scrollbar-thin scrollbar-thumb-orange-300/60 scrollbar-track-transparent"
        role="list"
        aria-label="Liste des compagnies partenaires"
      >
        {companies === null
          ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
          : companies.length === 0
          ? <p className="w-full text-center text-gray-500">Aucune compagnie partenaire pour le moment.</p>
          : companies.map((c) => {
              const card = (
                <motion.div
                  whileHover={{ scale: 1.03 }}
                  onMouseEnter={() => preload(c.logoUrl)}
                  onTouchStart={() => preload(c.logoUrl)}
                  className="min-w-[120px] max-w-[120px] snap-start bg-white rounded-2xl shadow-sm
                             border border-orange-100 p-3 hover:shadow-md transition select-none"
                  role="listitem"
                >
                  <div className="w-16 h-16 mx-auto rounded-full overflow-hidden border-2 border-orange-500 shadow-sm mb-2">
                    <img
                      src={c.logoUrl || "/images/partner-placeholder.png"}
                      alt={c.nom}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => ((e.currentTarget as HTMLImageElement).src = "/images/partner-placeholder.png")}
                    />
                  </div>
                  <p className="text-xs font-semibold text-gray-800 truncate" title={c.nom}>{c.nom}</p>
                  {c.pays && <p className="text-[11px] text-gray-500">{c.pays}</p>}
                </motion.div>
              );

              return c.slug?.trim()
                ? (
                  <Link key={c.id} to={`/${c.slug}`} aria-label={`Ouvrir la page de ${c.nom}`}
                        className="focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded-2xl">
                    {card}
                  </Link>
                )
                : <div key={c.id} aria-disabled="true" title="Page indisponible">{card}</div>;
            })}
      </div>
    </div>
  );
};

export default PartnersSection;
