import React from "react";

const Footer: React.FC = () => {
  return (
    <footer className="relative bg-white">
      <svg className="w-full" viewBox="0 0 1440 80" preserveAspectRatio="none" aria-hidden>
        <path fill="#fff" d="M0,64L48,69.3C96,75,192,85,288,80C384,75,480,53,576,53.3C672,53,768,75,864,80C960,85,1056,75,1152,74.7C1248,75,1344,85,1392,90.7L1440,96V0H0Z"/>
      </svg>

      <div className="bg-white text-gray-600 border-t border-orange-100">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <div className="text-gray-900 font-extrabold text-xl">
                Teliya <span className="text-orange-600">•</span>
              </div>
              <p className="text-sm mt-1">Réserver simplement, voyager sereinement.</p>
            </div>
            <nav className="flex flex-wrap gap-4 text-sm">
              <a href="/#:about" className="hover:text-gray-900">À propos</a>
              <a href="/#:help" className="hover:text-gray-900">Aide</a>
              <a href="/#:partners" className="hover:text-gray-900">Partenaires</a>
              <a href="/#:legal" className="hover:text-gray-900">Mentions légales</a>
            </nav>
          </div>

          <div className="mt-8 border-t border-orange-100 pt-6 text-xs flex items-center justify-between">
            <span>© {new Date().getFullYear()} Teliya. Tous droits réservés.</span>
            <span className="text-orange-600">Made with ♥</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
