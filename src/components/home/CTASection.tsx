import React from "react";

const CTASection: React.FC = () => {
  const scrollToSearch = () => {
    document.getElementById("search")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="max-w-4xl mx-auto text-center">
      <h2 className="text-2xl md:text-3xl font-extrabold mb-2">Prêt à voyager avec Teliya&nbsp;?</h2>
      <p className="text-white/90 mb-6">
        Réservez vos billets en ligne et profitez des meilleurs trajets en Afrique.
      </p>
      <button
        onClick={scrollToSearch}
        className="bg-white text-orange-600 px-6 py-3 rounded-xl font-semibold hover:bg-orange-50"
      >
        Commencer maintenant
      </button>
    </div>
  );
};

export default CTASection;
