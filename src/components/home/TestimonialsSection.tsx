import React from "react";

const testimonials = [
  { name: "Fatoumata", text: "TIKETA+ m’a permis d’économiser sur mes trajets.", city: "Bamako" },
  { name: "Jean-Paul", text: "Service client impeccable et rapide.", city: "Abidjan" },
  { name: "Aminata", text: "Réservation simple et efficace !", city: "Dakar" },
];

const TestimonialsSection: React.FC = () => {
  return (
    <div className="max-w-5xl mx-auto text-center">
      <h2 className="text-xl font-bold mb-6">Ils nous font confiance</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {testimonials.map((t, i) => (
          <div key={i} className="p-4 bg-white border rounded shadow">
            <p className="italic mb-2">"{t.text}"</p>
            <h4 className="font-semibold">{t.name}</h4>
            <p className="text-sm text-gray-600">{t.city}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TestimonialsSection;
