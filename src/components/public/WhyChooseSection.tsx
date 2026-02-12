// src/components/public/WhyChooseSection.tsx

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
      className="py-5 px-4"
      style={{
        backgroundColor: `${secondaryColor}08`,
      }}
    >
      <div className="max-w-5xl mx-auto">

        {/* Titre cohérent */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <Bus size={18} style={{ color: primaryColor }} />
          <h2 className="text-lg font-semibold text-gray-900 text-center">
            Pourquoi choisir {companyName} ?
          </h2>
        </div>

        {/* Carte compacte */}
        <div
          className="rounded-2xl border overflow-hidden"
          style={{
            borderColor: `${primaryColor}30`,
            boxShadow: `0 4px 15px ${primaryColor}10`,
            backgroundColor: "#ffffff",
          }}
        >
          <div className="grid grid-cols-2 divide-x divide-y">

            {items.slice(0, 4).map((item, index) => {
              const IconComponent =
                iconMap[item.icon || ""] || ShieldCheck;

              return (
                <div
                  key={index}
                  className="p-3 flex items-center gap-3"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor: `${secondaryColor}15`,
                    }}
                  >
                    <IconComponent
                      size={16}
                      style={{ color: secondaryColor }}
                    />
                  </div>

                  <div>
                    <p className="text-sm font-medium text-gray-800 leading-tight">
                      {item.label}
                    </p>

                    {item.description && (
                      <p className="text-xs text-gray-500 leading-tight mt-1">
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
