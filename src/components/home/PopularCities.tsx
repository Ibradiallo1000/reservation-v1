import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";

type City = { id: string; name?: string; nom?: string; flag?: string; country?: string; popularity?: number };

const PopularCities: React.FC = () => {
  const [cities, setCities] = useState<City[]>([]);
  const [loaded, setLoaded] = useState(false);

  const country = "Mali"; // TODO: détecter automatiquement plus tard

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const base = collection(db, "villes");
        const q = country ? query(base, where("country", "==", country)) : base;
        const snap = await getDocs(q);
        const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as City[];
        const cleaned = list
          .map(c => ({ ...c, label: c.name || c.nom }))
          .filter(c => !!c.label)
          .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
          .slice(0, 6);
        if (mounted) setCities(cleaned);
      } catch {
        // silent fail en public
      } finally {
        if (mounted) setLoaded(true);
      }
    })();
    return () => { mounted = false; };
  }, [country]);

  if (!loaded || cities.length === 0) return null;

  return (
    <div className="max-w-5xl mx-auto text-center">
      <h2 className="text-lg font-semibold mb-4">Destinations populaires</h2>
      <div className="flex flex-wrap justify-center gap-3">
        {cities.map((city) => (
          <span
            key={city.id}
            className="px-4 py-2 border rounded-full bg-gray-100 hover:bg-orange-100 text-gray-700 font-medium cursor-pointer"
          >
            {city.flag || "🏙️"} {city.name || city.nom}
          </span>
        ))}
      </div>
    </div>
  );
};

export default PopularCities;
