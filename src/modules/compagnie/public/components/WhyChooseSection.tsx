import React from "react";
import { WhyChooseItem } from "@/types/companyTypes";
import { Clock, ShieldCheck, Bus, Star } from "lucide-react";

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

  return (
    <section
      className="py-6 px-4"
      style={{
        backgroundColor: `${secondaryColor}08`,
      }}
    >
      <div className="max-w-5xl mx-auto">

        {/* Titre */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <Bus size={18} style={{ color: primaryColor }} />
          <h2 className="text-lg font-semibold text-gray-900 text-center">
            Pourquoi choisir {companyName} ?
          </h2>
        </div>

        {/* Carte principale */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            border: `1px solid ${primaryColor}20`,
            boxShadow: `0 6px 18px ${primaryColor}12`,
            backgroundColor: "#ffffff",
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
                    <p className="text-sm font-medium text-gray-800 leading-tight">
                      {item.label}
                    </p>

                    {item.description && (
                      <p className="text-xs text-gray-500 mt-1 leading-tight">
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
