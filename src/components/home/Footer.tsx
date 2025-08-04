import React from "react";

const Footer: React.FC = () => {
  return (
    <footer className="bg-gray-900 text-gray-400 py-6 text-center">
      <p>© {new Date().getFullYear()} Teliya – Tous droits réservés.</p>
    </footer>
  );
};

export default Footer;
