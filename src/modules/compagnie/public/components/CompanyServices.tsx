import React from "react";
import { Wifi, Wind, Zap, Coffee, Sofa, Tv, Snowflake, Bus } from "lucide-react";
import { useTranslation } from "react-i18next";

interface CompanyServicesProps {
  services: string[];
  primaryColor: string;
  secondaryColor: string;
}

const SERVICES_MAP: Record<string, { labelKey: string; descriptionKey: string; icon: React.ElementType }> = {
  wifi: { labelKey: "serviceWifi", descriptionKey: "serviceWifiPremiumDesc", icon: Wifi },
  climatisation: { labelKey: "serviceClimatisation", descriptionKey: "serviceClimatisationPremiumDesc", icon: Wind },
  usb: { labelKey: "serviceUsb", descriptionKey: "serviceUsbPremiumDesc", icon: Zap },
  boisson: { labelKey: "serviceBoisson", descriptionKey: "serviceBoissonPremiumDesc", icon: Coffee },
  sieges_confort: { labelKey: "serviceSiegesConfort", descriptionKey: "serviceSiegesConfortPremiumDesc", icon: Sofa },
  tv: { labelKey: "serviceTv", descriptionKey: "serviceTvPremiumDesc", icon: Tv },
  eau_fraiche: { labelKey: "serviceEauFraiche", descriptionKey: "serviceEauFraichePremiumDesc", icon: Snowflake },
};

const CompanyServices: React.FC<CompanyServicesProps> = ({
  services,
  primaryColor,
  secondaryColor,
}) => {
  const { t } = useTranslation();
  if (!services?.length) return null;

  const validServices = services.filter((key) => SERVICES_MAP[key]);
  if (!validServices.length) return null;

  return (
    <section className="public-premium-section">
      <div className="public-premium-container">
        <div className="mb-3 flex items-center gap-3 sm:mb-7">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--public-secondary-soft)] sm:h-11 sm:w-11 sm:rounded-2xl">
            <Bus size={21} style={{ color: secondaryColor }} />
          </div>
          <h2 className="public-premium-heading text-lg sm:text-2xl">
            {t("onBoardServices")}
          </h2>
        </div>

        <div className="grid auto-rows-fr grid-cols-2 gap-3 lg:grid-cols-4">
          {validServices.map((key) => {
            const { icon: Icon, labelKey, descriptionKey } = SERVICES_MAP[key];
            return (
              <div
                key={key}
                className="public-premium-card flex h-full min-h-32 flex-col items-center justify-center px-2 py-3 text-center transition-transform duration-300 hover:-translate-y-1 sm:min-h-44 sm:px-5 sm:py-5"
              >
                <div
                  className="mb-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:mb-3 sm:h-14 sm:w-14"
                  style={{
                    color: primaryColor,
                    background: `linear-gradient(135deg, color-mix(in srgb, ${primaryColor} 14%, white), color-mix(in srgb, ${secondaryColor} 12%, white))`,
                  }}
                >
                  <Icon size={23} />
                </div>
                <h3 className="text-sm font-extrabold text-[var(--public-ink)] sm:text-base">
                  {t(labelKey)}
                </h3>
                <p className="mt-1 max-w-[15rem] text-xs leading-snug text-[var(--public-muted)] sm:mt-1.5 sm:text-sm sm:leading-relaxed">
                  {t(descriptionKey)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default CompanyServices;
