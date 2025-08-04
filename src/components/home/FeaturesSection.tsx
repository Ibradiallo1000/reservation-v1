import React from "react";
import { ShieldCheck, Zap, Globe, TrendingUp } from "lucide-react";

const features = [
  { icon: <ShieldCheck className="h-6 w-6 text-blue-600" />, title: "Sécurité", desc: "Paiements sécurisés et fiables" },
  { icon: <Zap className="h-6 w-6 text-blue-600" />, title: "Rapidité", desc: "Réservez vos billets en quelques secondes" },
  { icon: <Globe className="h-6 w-6 text-blue-600" />, title: "Couverture", desc: "Des trajets dans toute l'Afrique de l’Ouest" },
  { icon: <TrendingUp className="h-6 w-6 text-blue-600" />, title: "Économie", desc: "Les meilleurs prix garantis" },
];

const FeaturesSection: React.FC = () => {
  return (
    <div className="max-w-6xl mx-auto text-center">
      <h2 className="text-xl font-bold mb-6">Pourquoi choisir TIKETA+</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {features.map((f, i) => (
          <div key={i} className="p-4 bg-white shadow rounded">
            <div className="mb-2 flex justify-center">{f.icon}</div>
            <h3 className="font-semibold mb-1">{f.title}</h3>
            <p className="text-sm text-gray-600">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FeaturesSection;
