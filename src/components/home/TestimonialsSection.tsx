import React, { useEffect, useState } from "react";
import SectionTitle from "@/components/ui/SectionTitle";

const DATA = [
  { name: "Fatoumata", text: "Teliya m’a permis d’économiser sur mes trajets.", city: "Bamako" },
  { name: "Jean-Paul", text: "Service client impeccable et rapide.", city: "Abidjan" },
  { name: "Aminata",   text: "Réservation simple et efficace !", city: "Dakar" },
];

const TestimonialsSection: React.FC = () => {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI(v => (v + 1) % DATA.length), 5000);
    return () => clearInterval(id);
  }, []);

  const t = DATA[i];
  return (
    <section className="py-8 md:py-10 bg-white">
      <div className="max-w-5xl mx-auto px-4 text-center">
        <SectionTitle className="mb-4">Ils nous font confiance</SectionTitle>

        <div className="mx-auto max-w-2xl bg-white border border-orange-100 rounded-xl shadow-sm p-6">
          <p className="italic text-gray-700 mb-3">“{t.text}”</p>
          <p className="font-semibold text-gray-900">{t.name}</p>
          <p className="text-sm text-gray-500">{t.city}</p>
        </div>

        <div className="mt-4 flex justify-center gap-2">
          {DATA.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setI(idx)}
              className={`h-2 w-2 rounded-full ${i === idx ? "bg-orange-600" : "bg-orange-200"}`}
              aria-label={`Témoignage ${idx + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default TestimonialsSection;
