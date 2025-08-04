import React from "react";

const CTASection: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto text-center">
      <h2 className="text-2xl font-bold mb-4">Prêt à voyager avec TIKETA+ ?</h2>
      <p className="text-gray-100 mb-6">
        Réservez vos billets en ligne et profitez des meilleurs trajets en Afrique.
      </p>
      <button className="bg-white text-blue-600 px-6 py-3 rounded font-semibold hover:bg-gray-100">
        Commencer maintenant
      </button>
    </div>
  );
};

export default CTASection;
