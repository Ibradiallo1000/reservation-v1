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

const MAIN_SERVICE_KEYS = ["wifi", "climatisation", "tv", "sieges_confort"];

const CompanyServices: React.FC<CompanyServicesProps> = ({
  services,
  primaryColor,
  secondaryColor,
}) => {
  const { t } = useTranslation();
  if (!services?.length) return null;

  const validServices = MAIN_SERVICE_KEYS.filter((key) => services.includes(key) && SERVICES_MAP[key]);
  if (!validServices.length) return null;

  return (
    <section className="public-premium-section">
      <div className="public-premium-container">
        <div className="public-premium-card p-4 sm:p-5">
          <div className="mb-4 flex min-w-0 items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--public-secondary-soft)] sm:h-11 sm:w-11 sm:rounded-2xl">
              <Bus size={21} style={{ color: secondaryColor }} />
            </div>
            <div className="min-w-0">
              <h2 className="public-premium-heading text-xl sm:text-2xl">
                {t("onBoardServices")}
              </h2>
              <p className="mt-0.5 text-xs text-[var(--public-muted)] sm:text-sm">
                {t("onBoardServicesSubtitle")}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
            {validServices.map((key) => {
              const { icon: Icon, labelKey } = SERVICES_MAP[key];
              return (
                <div
                  key={key}
                  className="flex min-w-0 items-center gap-2.5 rounded-xl border border-[var(--public-line)] bg-[var(--public-surface)] px-3 py-2.5 transition-transform duration-300 hover:-translate-y-0.5 sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3"
                >
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10"
                    style={{
                      color: primaryColor,
                      background: `linear-gradient(135deg, color-mix(in srgb, ${primaryColor} 14%, white), color-mix(in srgb, ${secondaryColor} 12%, white))`,
                    }}
                  >
                    <Icon size={20} />
                  </div>
                  <h3 className="text-sm font-extrabold leading-tight text-[var(--public-ink)]">
                    {t(labelKey)}
                  </h3>
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
