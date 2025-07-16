// ✅ COMPOSANT : MobileMenu avec fond noir étoilé + sélecteur de langue intégré
import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Phone, Settings, Shield, Languages } from 'lucide-react';
import LanguageSwitcher from '../ui/LanguageSwitcher';

interface MobileMenuProps {
  onClose: () => void;
  navigate: (path: string) => void;
  onShowAgencies: () => void;
  slug: string;
  colors: {
    primary: string;
    secondary?: string;
  };
  classes: any;
  config: any;
  t: (key: string) => string;
}

const StarryBackground: React.FC<{ canvasRef: React.RefObject<HTMLCanvasElement> }> = ({ canvasRef }) => {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    ctx.fillStyle = 'rgba(10, 10, 20, 0.95)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const starCount = 100;
    for (let i = 0; i < starCount; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const radius = Math.random() * 1.2;
      const opacity = Math.random() * 0.8 + 0.2;

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
      ctx.fill();
    }
  }, []);

  return null;
};

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
  const canvasRef = useRef<HTMLCanvasElement>(null);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="fixed top-20 right-4 left-4 z-50 rounded-xl shadow-2xl overflow-hidden"
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <StarryBackground canvasRef={canvasRef} />

      <div className="relative z-10 p-4 text-white">
        <nav className="flex flex-col gap-2">
          <button
            onClick={() => {
              onShowAgencies();
              onClose();
            }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all hover:bg-white hover:bg-opacity-10 ${classes.button}`}
            aria-label={t('ourAgencies')}
          >
            <MapPin className="h-5 w-5 text-blue-300" />
            <span className="font-medium">{t('ourAgencies')}</span>
          </button>

          <button
            onClick={() => {
              navigate(`/compagnie/${slug}/mes-reservations`);
              onClose();
            }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all hover:bg-white hover:bg-opacity-10 ${classes.button}`}
            aria-label={t('myBookings')}
          >
            <Shield className="h-5 w-5 text-green-300" />
            <span className="font-medium">{t('myBookings')}</span>
          </button>

          <button
            onClick={() => {
              navigate('/login');
              onClose();
            }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all hover:bg-white hover:bg-opacity-10 ${classes.button}`}
            aria-label={t('login')}
          >
            <Settings className="h-5 w-5 text-yellow-300" />
            <span className="font-medium">{t('login')}</span>
          </button>

          {/* ✅ Ajout sélecteur de langue */}
          <div className="mt-4 pt-4 border-t border-white border-opacity-20">
            <div className="flex items-center gap-2 mb-2 text-sm font-medium">
              <Languages className="h-4 w-4 text-white" />
              <span className="text-white">{t('language') || 'Langue'}</span>
            </div>
            <LanguageSwitcher />
          </div>
        </nav>
      </div>
    </motion.div>
  );
};

export default MobileMenu;
