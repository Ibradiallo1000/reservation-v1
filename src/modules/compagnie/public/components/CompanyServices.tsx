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
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  if (!services?.length) return null;

  const validServices = services.filter((k) => SERVICES_MAP[k]);
  if (!validServices.length) return null;

  return (
    <section
      className="py-6 px-4 bg-[color:var(--section-bg)] dark:bg-neutral-950/70"
      style={
        {
          ["--section-bg" as string]: `${secondaryColor}08`,
        } as React.CSSProperties
      }
    >
      <div className="max-w-5xl mx-auto">

        {/* Titre */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <Bus size={18} style={{ color: primaryColor }} />
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:!text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.25)]">
            {t("onBoardServices")}
          </h2>
        </div>

        {/* Carte harmonisée */}
        <div
          className="rounded-2xl overflow-hidden bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700"
          style={{
            boxShadow: `0 6px 18px ${primaryColor}12`,
          }}
        >
          <div
            className="grid grid-cols-2 sm:grid-cols-3"
            style={{
              borderTop: `1px solid ${primaryColor}10`,
              borderLeft: `1px solid ${primaryColor}10`,
            }}
          >
            {validServices.map((key) => {
              const { icon: Icon, label } = SERVICES_MAP[key];

              return (
                <div
                  key={key}
                  className="p-4 flex items-center gap-3"
                  style={{
                    borderRight: `1px solid ${primaryColor}10`,
                    borderBottom: `1px solid ${primaryColor}10`,
                  }}
                >
                  {/* Icône */}
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor: `${secondaryColor}15`,
                    }}
                  >
                    <Icon
                      size={16}
                      style={{ color: secondaryColor }}
                    />
                  </div>

                  {/* Texte */}
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
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
