import React, { useEffect, useState } from "react";
import { ShieldCheck, Zap, Globe, TrendingUp } from "lucide-react";

const FEATURES = [
  { icon: ShieldCheck, title: "Sécurité",  desc: "Paiements sécurisés et fiables" },
  { icon: Zap,        title: "Rapidité",  desc: "Réservez vos billets en quelques secondes" },
  { icon: Globe,      title: "Couverture",desc: "Des trajets dans toute l’Afrique de l’Ouest" },
  { icon: TrendingUp, title: "Économie",  desc: "Les meilleurs prix garantis" },
];

const FeaturesSection: React.FC = () => {
  const [i, setI] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setI(v => (v + 1) % FEATURES.length), 4000);
    return () => clearInterval(id);
  }, []);

  const F = FEATURES[i];

  return (
    <div className="max-w-6xl mx-auto px-4 text-center">
      <div className="mx-auto max-w-md bg-white border border-orange-200 rounded-xl shadow-sm p-6">
        <div className="flex flex-col items-center gap-2">
          <F.icon className="h-7 w-7 text-orange-600" />
          <h3 className="text-lg font-semibold text-gray-900">{F.title}</h3>
          <p className="text-sm text-gray-600">{F.desc}</p>
        </div>
      </div>

      {/* Puces d’état */}
      <div className="mt-4 flex justify-center gap-2">
        {FEATURES.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setI(idx)}
            className={`h-2 w-2 rounded-full ${i === idx ? "bg-orange-600" : "bg-orange-200"}`}
            aria-label={`Aller à la carte ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
};

export default FeaturesSection;
