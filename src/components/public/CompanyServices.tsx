import React, { useState } from 'react';
import {
  Wifi,
  Wind,
  Zap,
  Coffee,
  Sofa,
  Tv,
  Snowflake,
  Bus,
} from 'lucide-react';

/* =========================
   TYPES
========================= */
interface CompanyServicesProps {
  services: string[];
  primaryColor?: string;
  secondaryColor?: string;
}

/* =========================
   SERVICES CONFIG
========================= */
const SERVICES_MAP: Record<
  string,
  {
    label: string;
    icon: React.ElementType;
  }
> = {
  wifi: { label: 'Wi-Fi à bord', icon: Wifi },
  climatisation: { label: 'Bus climatisé', icon: Wind },
  prise_usb: { label: 'Prise USB', icon: Zap },
  boisson: { label: 'Boisson offerte', icon: Coffee },
  sieges_confort: { label: 'Sièges confort', icon: Sofa },
  ecran_tv: { label: 'Écran / TV', icon: Tv },
  eau_fraiche: { label: 'Eau fraîche', icon: Snowflake },
};

/* =========================
   COMPONENT
========================= */
const CompanyServices: React.FC<CompanyServicesProps> = ({
  services,
  primaryColor = '#F97316',
  secondaryColor = '#FDBA74',
}) => {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  if (!services?.length) return null;

  const validServices = services.filter((k) => SERVICES_MAP[k]);
  if (!validServices.length) return null;

  const toggle = (key: string) => {
    setActiveKey((prev) => (prev === key ? null : key));
  };

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 mt-10">
      {/* TITRE */}
      <h2 className="flex items-center justify-center gap-3
                     text-xl sm:text-2xl font-bold mb-6 text-gray-900">
        <Bus className="w-6 h-6" style={{ color: primaryColor }} />
        Services à bord
      </h2>

      {/* SERVICES */}
      <div className="flex justify-center gap-4 flex-wrap">
        {validServices.map((key) => {
          const { icon: Icon, label } = SERVICES_MAP[key];
          const active = activeKey === key;

          return (
            <div key={key} className="flex flex-col items-center">
              {/* ICON CARD */}
              <button
                type="button"
                onClick={() => toggle(key)}
                className={`w-14 h-14 rounded-2xl
                            flex items-center justify-center
                            border transition-all
                            ${active ? 'shadow-lg' : 'shadow-sm'}
                            hover:-translate-y-1`}
                style={{
                  background: active
                    ? `linear-gradient(135deg, ${primaryColor}22, ${secondaryColor}22)`
                    : '#fff',
                  borderColor: active ? primaryColor : '#e5e7eb',
                }}
              >
                <Icon
                  className="w-6 h-6"
                  style={{ color: primaryColor }}
                />
              </button>

              {/* LABEL (CLICK / MOBILE) */}
              {active && (
                <span className="mt-2 text-xs font-medium text-gray-800 text-center">
                  {label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default CompanyServices;
