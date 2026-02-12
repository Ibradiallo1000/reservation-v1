// src/components/public/CompanyServices.tsx

import React from "react";
import {
  Wifi,
  Wind,
  Zap,
  Coffee,
  Sofa,
  Tv,
  Snowflake,
  Bus,
} from "lucide-react";

interface CompanyServicesProps {
  services: string[];
  primaryColor: string;
  secondaryColor: string;
}

const SERVICES_MAP: Record<
  string,
  {
    label: string;
    icon: React.ElementType;
  }
> = {
  wifi: { label: "Wi-Fi à bord", icon: Wifi },
  climatisation: { label: "Bus climatisé", icon: Wind },
  usb: { label: "Prise USB", icon: Zap },
  boisson: { label: "Boisson offerte", icon: Coffee },
  sieges_confort: { label: "Sièges confort", icon: Sofa },
  tv: { label: "Écran / TV", icon: Tv },
  eau_fraiche: { label: "Eau fraîche", icon: Snowflake },
};

const CompanyServices: React.FC<CompanyServicesProps> = ({
  services,
  primaryColor,
  secondaryColor,
}) => {
  if (!services?.length) return null;

  const validServices = services.filter((k) => SERVICES_MAP[k]);
  if (!validServices.length) return null;

  return (
    <section
      className="py-5 px-4"
      style={{
        backgroundColor: `${secondaryColor}08`,
      }}
    >
      <div className="max-w-5xl mx-auto">

        {/* Titre */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <Bus size={18} style={{ color: primaryColor }} />
          <h2 className="text-lg font-semibold text-gray-900">
            Services à bord
          </h2>
        </div>

        {/* Carte harmonisée */}
        <div
          className="rounded-2xl border overflow-hidden"
          style={{
            borderColor: `${primaryColor}30`,
            boxShadow: `0 4px 15px ${primaryColor}10`,
            backgroundColor: "#ffffff",
          }}
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 divide-x divide-y">

            {validServices.map((key) => {
              const { icon: Icon, label } = SERVICES_MAP[key];

              return (
                <div
                  key={key}
                  className="p-4 flex items-center gap-3"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor: `${secondaryColor}15`,
                    }}
                  >
                    <Icon
                      size={16}
                      style={{ color: secondaryColor }}
                    />
                  </div>

                  <span className="text-sm font-medium text-gray-800">
                    {label}
                  </span>
                </div>
              );
            })}

          </div>
        </div>
      </div>
    </section>
  );
};

export default CompanyServices;
