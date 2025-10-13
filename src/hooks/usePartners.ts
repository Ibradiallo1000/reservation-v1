// src/hooks/usePartners.ts
import { useEffect, useState } from "react";
import { db } from "@/firebaseConfig";
import { collection, getDocs, limit, query, where } from "firebase/firestore";

export type Partner = {
  id: string;
  nom: string;
  pays?: string;
  logoUrl?: string;
};

export function usePartners() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        // 👉 Filtre minimal, sans opérateurs fragiles
        const q = query(
          collection(db, "companies"),
          where("publicPageEnabled", "==", true),
          where("status", "==", "actif"),
          limit(24)
        );
        const snap = await getDocs(q);
        if (dead) return;
        setPartners(
          snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
        );
      } catch (e) {
        console.error("PartnersSection ► Firestore", e);
        if (!dead) setPartners([]);
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => { dead = true; };
  }, []);

  return { partners, loading };
}
