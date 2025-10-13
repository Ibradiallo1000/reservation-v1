import React from "react";

const CTASection: React.FC = () => {
  const scrollToSearch = () => {
    document.getElementById("search")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="max-w-4xl mx-auto text-center">
      <h2 className="text-2xl md:text-3xl font-extrabold mb-2 text-gray-900">
        Prêt à voyager avec Teliya&nbsp;?
      </h2>
      <p className="text-gray-600 mb-6">
        Réservez vos billets en ligne et profitez des meilleurs trajets en Afrique.
      </p>
      <button
        onClick={scrollToSearch}
        className="bg-orange-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-orange-700"
      >
        Commencer maintenant
      </button>
    </div>
  );
};

export default CTASection;
