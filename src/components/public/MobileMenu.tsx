// ✅ COMPOSANT : MobileMenu - Menu mobile avec props sécurisées
import React from 'react';
import { motion } from 'framer-motion';
import { MapPin, Phone, Settings, Shield } from 'lucide-react';

interface MobileMenuProps {
  onClose: () => void;
  navigate: (path: string) => void;
  onShowAgencies: () => void;
  slug: string;
  colors: any;
  classes: any;
  config: any;
  t: (key: string) => string;
}

const MobileMenu: React.FC<MobileMenuProps> = ({
  onClose,
  navigate,
  onShowAgencies,
  slug,
  colors,
  classes,
  config,
  t
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2 }}
      className="fixed top-20 right-4 left-4 z-50 bg-white/10 backdrop-blur-xl rounded-lg shadow-lg p-4"
    >
      <nav className="flex flex-col gap-4">
        <button
          onClick={() => {
            onShowAgencies();
            onClose();
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md transition ${classes.button}`}
        >
          <MapPin className="h-5 w-5" />
          {t('ourAgencies')}
        </button>

        <button
          onClick={() => {
            navigate(`/compagnie/${slug}/mes-reservations`);
            onClose();
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md transition ${classes.button}`}
        >
          <Shield className="h-5 w-5" />
          {t('myBookings')}
        </button>

        <button
          onClick={() => {
            navigate(`/compagnie/${slug}/contact`);
            onClose();
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md transition ${classes.button}`}
        >
          <Phone className="h-5 w-5" />
          {t('contact')}
        </button>

        <button
          onClick={() => {
            navigate('/login');
            onClose();
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md transition ${classes.button}`}
        >
          <Settings className="h-5 w-5" />
          {t('login')}
        </button>
      </nav>
    </motion.div>
  );
};

export default MobileMenu;
