import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where, Query, CollectionReference, DocumentData } from "firebase/firestore";
import { db } from "@/firebaseConfig";

interface City {
  id: string;
  name: string;
  flag: string;
  country: string;
  popularity?: number; // optionnel, pour trier
}

const PopularCities: React.FC = () => {
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);

  // 🔑 Ici tu peux mettre la détection automatique du pays (ex: via IP, user settings)
  const country = "Mali"; // pour le test, on fixe "Mali"

  useEffect(() => {
    const fetchCities = async () => {
      try {
        const villesCollection: CollectionReference<DocumentData> = collection(db, "villes");

        // ✅ Déclare q comme Query<DocumentData>
        let q: Query<DocumentData> = villesCollection;

        if (country) {
          q = query(villesCollection, where("country", "==", country));
        }

        const snapshot = await getDocs(q);

        let list: City[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<City, "id">),
        }));

        // ✅ Tri par popularité si dispo
        list = list.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

        // ✅ Limite à 6 villes max
        setCities(list.slice(0, 6));
      } catch (err) {
        console.error("Erreur lors du chargement des villes:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchCities();
  }, [country]);

  if (loading) {
    return <p className="text-center py-10">Chargement des villes populaires...</p>;
  }

  if (cities.length === 0) {
    return <p className="text-center py-10 text-gray-500">Aucune ville disponible pour ce pays.</p>;
  }

  return (
    <div className="max-w-5xl mx-auto text-center">
      <h2 className="text-lg font-semibold mb-4">Destinations populaires</h2>
      <div className="flex flex-wrap justify-center gap-3">
        {cities.map((city) => (
          <span
            key={city.id}
            className="px-4 py-2 border rounded-full bg-gray-100 hover:bg-orange-100 text-gray-700 font-medium cursor-pointer"
          >
            {city.flag || "🏙️"} {city.name}
          </span>
        ))}
      </div>
    </div>
  );
};

export default PopularCities;
