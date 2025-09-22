// src/components/public/MobileMenu.tsx
// ✅ COMPOSANT : MobileMenu avec fond noir étoilé + sélecteur de langue intégré
import React, { useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Settings, Shield, Languages, X } from "lucide-react";
import LanguageSwitcher from "../ui/LanguageSwitcher";

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
  /** Si vous voulez afficher/masquer avec AnimatePresence */
  open?: boolean;
}

const drawStars = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const { width, height } = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.scale(dpr, dpr);

  // Fond
  ctx.fillStyle = "rgba(10, 10, 20, 0.95)";
  ctx.fillRect(0, 0, width, height);

  // Étoiles
  const starCount = 100;
  for (let i = 0; i < starCount; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const radius = Math.random() * 1.2;
    const opacity = Math.random() * 0.8 + 0.2;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.fill();
  }
};

const MobileMenu: React.FC<MobileMenuProps> = ({
  onClose,
  navigate,
  onShowAgencies,
  slug,
  colors,
  classes,
  config,
  t,
  open = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const paint = useCallback(() => {
    if (canvasRef.current) drawStars(canvasRef.current);
  }, []);

  // Dessin initial + redimensionnement
  useEffect(() => {
    paint();
    const ro = new ResizeObserver(paint);
    if (containerRef.current) ro.observe(containerRef.current);
    const onResize = () => paint();
    window.addEventListener("resize", onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [paint]);

  // Fermer avec ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Fermer en cliquant en dehors
  const onBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const MenuContent = (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.25 }}
      className="fixed top-16 right-4 left-4 z-50 rounded-xl shadow-2xl overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label={t("menu") || "Menu"}
      ref={containerRef}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div className="relative z-10 p-4 text-white">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm opacity-80">MALI TRANS</div>
          <button
            onClick={onClose}
            aria-label={t("close") || "Fermer"}
            className="p-2 rounded-lg hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/30"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-col gap-2">
          <button
            onClick={() => {
              onShowAgencies();
              onClose();
            }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all hover:bg-white/10 ${classes?.button || ""}`}
            aria-label={t("ourAgencies")}
          >
            <MapPin className="h-5 w-5 text-blue-300" />
            <span className="font-medium">{t("ourAgencies")}</span>
          </button>

          {/* ✅ Lien correct vers la page publique "Mes réservations" */}
          <button
            onClick={() => {
              navigate(slug ? `/${slug}/mes-reservations` : "/mes-reservations");
              onClose();
            }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all hover:bg-white/10 ${classes?.button || ""}`}
            aria-label={t("myBookings")}
          >
            <Shield className="h-5 w-5 text-green-300" />
            <span className="font-medium">{t("myBookings")}</span>
          </button>

          <button
            onClick={() => {
              navigate("/login");
              onClose();
            }}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all hover:bg-white/10 ${classes?.button || ""}`}
            aria-label={t("login")}
          >
            <Settings className="h-5 w-5 text-yellow-300" />
            <span className="font-medium">{t("login")}</span>
          </button>

          {/* ✅ Sélecteur de langue */}
          <div className="mt-4 pt-4 border-t border-white/20">
            <div className="flex items-center gap-2 mb-2 text-sm font-medium">
              <Languages className="h-4 w-4 text-white" />
              <span className="text-white">{t("language") || "Langue"}</span>
            </div>
            <LanguageSwitcher />
          </div>
        </nav>
      </div>
    </motion.div>
  );

  // Backdrop + menu (AnimatePresence optionnel)
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onBackdropClick}
        >
          {MenuContent}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default MobileMenu;
