import React from "react";
import { WhyChooseItem } from "@/types/companyTypes";
import { Clock, ShieldCheck, Bus, Star } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  companyName: string;
  items: WhyChooseItem[];
  primaryColor: string;
  secondaryColor?: string;
}

const iconMap: Record<string, any> = {
  clock: Clock,
  shield: ShieldCheck,
  bus: Bus,
  star: Star,
};

const WhyChooseSection: React.FC<Props> = ({
  companyName,
  items,
  primaryColor,
  secondaryColor = "#0063ff",
}) => {
  if (!items || items.length === 0) return null;
  const { t } = useTranslation();

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
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:!text-white text-center drop-shadow-[0_1px_6px_rgba(0,0,0,0.25)]">
            {t("whyChooseCompany", { companyName })}
          </h2>
        </div>

        {/* Carte principale */}
        <div
          className="rounded-2xl overflow-hidden bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700"
          style={{
            boxShadow: `0 6px 18px ${primaryColor}12`,
          }}
        >
          <div
            className="grid grid-cols-2"
            style={{
              borderTop: `1px solid ${primaryColor}10`,
              borderLeft: `1px solid ${primaryColor}10`,
            }}
          >
            {items.slice(0, 4).map((item, index) => {
              const IconComponent =
                iconMap[item.icon || ""] || ShieldCheck;

              return (
                <div
                  key={index}
                  className="p-3 flex items-center gap-3"
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
                    <IconComponent
                      size={16}
                      style={{ color: secondaryColor }}
                    />
                  </div>

                  {/* Texte */}
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-tight">
                      {item.label}
                    </p>

                    {item.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-300 mt-1 leading-tight">
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </section>
  );
};

export default WhyChooseSection;
