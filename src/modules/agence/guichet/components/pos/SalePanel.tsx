import React, { useRef, useEffect, useState, useMemo } from "react";
import {
  Minus, Plus, ShoppingCart, Loader2, AlertTriangle, Ticket,
  Users, UserPlus,
} from "lucide-react";
import { capitalizeFullName, formatPhoneMaliDisplay, rawPhoneMali } from "../../utils/guichetFormatters";

interface SelectedTrip {
  departure: string;
  arrival: string;
  date: string;
  time: string;
  price: number;
  remainingSeats?: number;
}

export interface ClientSuggestion {
  name: string;
  phone: string;
}

export interface TariffOption {
  key: string;
  label: string;
  multiplier: number;
}

export const TARIFF_OPTIONS: TariffOption[] = [
  { key: "plein",    label: "Plein tarif",      multiplier: 1.0  },
  { key: "enfant",   label: "Enfant (−50%)",    multiplier: 0.5  },
  { key: "senior",   label: "Senior (−25%)",    multiplier: 0.75 },
  { key: "fidelite", label: "Fidélité (−10%)",  multiplier: 0.9  },
];

interface Props {
  selectedTrip: SelectedTrip | null;
  canSell: boolean;
  status: string;
  nomClient: string;
  onNomChange: (v: string) => void;
  telephone: string;
  onTelChange: (v: string) => void;
  placesAller: number;
  onPlacesAllerChange: (n: number) => void;
  totalPrice: number;
  canValidate: boolean;
  isProcessing: boolean;
  onValidate: () => void;
  formatMoney: (n: number) => string;
  primaryColor: string;
  secondaryColor: string;
  validationHint: string;
  clientSuggestions?: ClientSuggestion[];
  tariffKey?: string;
  onTariffChange?: (key: string) => void;
  tariffMultiplier?: number;
  additionalPassengers?: Array<{ name: string; phone: string }>;
  onAdditionalPassengersChange?: (p: Array<{ name: string; phone: string }>) => void;
}

export const SalePanel: React.FC<Props> = ({
  selectedTrip, canSell, status,
  nomClient, onNomChange, telephone, onTelChange,
  placesAller, onPlacesAllerChange,
  totalPrice, canValidate, isProcessing, onValidate,
  formatMoney, primaryColor, secondaryColor, validationHint,
  clientSuggestions = [],
  tariffKey = "plein", onTariffChange, tariffMultiplier = 1,
  additionalPassengers = [], onAdditionalPassengersChange,
}) => {
  const nameRef = useRef<HTMLInputElement>(null);
  const gradient = `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`;

  // ── Client autocomplete ──
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [multiMode, setMultiMode] = useState(false);

  const filtered = useMemo(() => {
    if (!nomClient || nomClient.length < 2) return [];
    const q = nomClient.toLowerCase();
    return clientSuggestions
      .filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q))
      .slice(0, 6);
  }, [nomClient, clientSuggestions]);

  useEffect(() => {
    if (selectedTrip && canSell) nameRef.current?.focus();
  }, [selectedTrip?.time, canSell]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canValidate && !isProcessing) {
      e.preventDefault();
      onValidate();
    }
  };

  const handleSelectSuggestion = (s: ClientSuggestion) => {
    onNomChange(capitalizeFullName(s.name));
    onTelChange(formatPhoneMaliDisplay(rawPhoneMali(s.phone)));
    setShowSuggestions(false);
  };

  const handleMultiToggle = () => {
    const next = !multiMode;
    setMultiMode(next);
    if (next && onAdditionalPassengersChange) {
      const extra = Math.max(0, placesAller - 1);
      onAdditionalPassengersChange(Array.from({ length: extra }, () => ({ name: "", phone: "" })));
    } else if (onAdditionalPassengersChange) {
      onAdditionalPassengersChange([]);
    }
  };

  useEffect(() => {
    if (!multiMode || !onAdditionalPassengersChange) return;
    const needed = Math.max(0, placesAller - 1);
    if (additionalPassengers.length !== needed) {
      const next = Array.from({ length: needed }, (_, i) => additionalPassengers[i] || { name: "", phone: "" });
      onAdditionalPassengersChange(next);
    }
  }, [placesAller, multiMode]);

  const displayPrice = tariffMultiplier !== 1
    ? formatMoney(totalPrice) + ` (${TARIFF_OPTIONS.find((t) => t.key === tariffKey)?.label || ""})`
    : formatMoney(totalPrice);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full min-h-0 max-h-[calc(100vh-10rem)]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 shrink-0" style={{ background: `${primaryColor}08` }}>
        <div className="flex items-center gap-1.5">
          <ShoppingCart className="w-4 h-4" style={{ color: primaryColor }} />
          <h2 className="text-base font-bold text-gray-900">Vente en cours</h2>
        </div>
        <p className="text-[11px] text-gray-500 mt-0.5">Paiement : espèces uniquement</p>
      </div>

      {/* Zone formulaire scrollable + Total + Bouton fixe en bas */}
      <div className="flex-1 min-h-0 flex flex-col p-4" onKeyDown={handleKeyDown}>
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1 -mr-1">
        {/* Activation warning */}
        {!canSell && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              {status === "pending"
                ? "En attente d'activation par la comptabilité."
                : "Ouvrez le comptoir pour commencer à vendre."}
            </p>
          </div>
        )}

        {/* Selected trip summary */}
        {selectedTrip ? (
          <div className="rounded-lg border-2 p-3" style={{ borderColor: `${primaryColor}40`, backgroundColor: `${primaryColor}04` }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm text-gray-900">{selectedTrip.departure} → {selectedTrip.arrival}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {new Date(selectedTrip.date + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                </p>
              </div>
              <div className="text-right">
                <span className="text-base font-bold" style={{ color: primaryColor }}>{selectedTrip.time}</span>
                <p className="text-[11px] text-gray-500">{formatMoney(selectedTrip.price)}/place</p>
              </div>
            </div>
            {selectedTrip.remainingSeats !== undefined && (
              <div className="mt-1.5 flex items-center gap-1">
                <Ticket className="w-3 h-3 text-gray-400" />
                <span className="text-[11px] text-gray-500">{selectedTrip.remainingSeats} places dispo.</span>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border-2 border-dashed border-gray-200 p-4 text-center">
            <Ticket className="w-5 h-5 text-gray-300 mx-auto mb-0.5" />
            <p className="text-xs text-gray-400">Sélectionnez un trajet</p>
          </div>
        )}

        {/* Passenger info with autocomplete */}
        <div className="space-y-3">
          <div className="relative">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-500">Passager *</label>
              {onAdditionalPassengersChange && (
                <button
                  type="button"
                  onClick={handleMultiToggle}
                  className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full transition ${
                    multiMode ? "text-white" : "text-gray-500 bg-gray-100 hover:bg-gray-200"
                  }`}
                  style={multiMode ? { background: primaryColor } : undefined}
                  title="Mode multi-passagers"
                >
                  <Users className="w-3 h-3" />
                  Multi
                </button>
              )}
            </div>
            <input
              ref={nameRef}
              value={nomClient}
              onChange={(e) => { onNomChange(e.target.value); setShowSuggestions(true); }}
              onFocus={() => { if (nomClient.length >= 2 && filtered.length > 0) setShowSuggestions(true); }}
              onBlur={() => {
                setTimeout(() => setShowSuggestions(false), 200);
                const capped = capitalizeFullName(nomClient);
                if (capped !== nomClient) onNomChange(capped);
              }}
              placeholder="Nom complet"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition"
              style={{ ["--tw-ring-color" as string]: `${primaryColor}40` }}
              autoComplete="off"
            />
            {/* Autocomplete dropdown */}
            {showSuggestions && filtered.length > 0 && (
              <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                {filtered.map((s, i) => (
                  <button
                    key={`${s.name}-${s.phone}-${i}`}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleSelectSuggestion(s); }}
                    className="w-full px-3.5 py-2.5 text-left hover:bg-gray-50 transition flex items-center justify-between"
                  >
                    <span className="text-sm text-gray-900">{s.name}</span>
                    <span className="text-xs text-gray-400">{s.phone}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Téléphone * (8 chiffres, Mali)</label>
            <input
              value={telephone}
              onChange={(e) => {
                const raw = rawPhoneMali(e.target.value);
                onTelChange(formatPhoneMaliDisplay(raw));
              }}
              placeholder="12 34 56 78"
              type="tel"
              inputMode="numeric"
              maxLength={11}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition"
              style={{ ["--tw-ring-color" as string]: `${primaryColor}40` }}
              autoComplete="off"
            />
          </div>
        </div>

        {/* Additional passengers (multi-mode) */}
        {multiMode && additionalPassengers.length > 0 && (
          <div className="space-y-2 p-3 rounded-xl bg-gray-50 border border-gray-200">
            <div className="flex items-center gap-1.5 mb-1">
              <UserPlus className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs font-medium text-gray-600">Passagers supplémentaires</span>
            </div>
            {additionalPassengers.map((p, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={p.name}
                  onChange={(e) => {
                    const next = [...additionalPassengers];
                    next[i] = { ...next[i], name: e.target.value };
                    onAdditionalPassengersChange?.(next);
                  }}
                  onBlur={() => {
                    const capped = capitalizeFullName(p.name);
                    if (capped !== p.name && additionalPassengers[i]) {
                      const next = [...additionalPassengers];
                      next[i] = { ...next[i], name: capped };
                      onAdditionalPassengersChange?.(next);
                    }
                  }}
                  placeholder={`Passager ${i + 2}`}
                  className="flex-1 border border-gray-200 rounded-lg px-2.5 py-2 text-xs"
                />
                <input
                  value={p.phone}
                  onChange={(e) => {
                    const next = [...additionalPassengers];
                    const raw = rawPhoneMali(e.target.value);
                    next[i] = { ...next[i], phone: formatPhoneMaliDisplay(raw) };
                    onAdditionalPassengersChange?.(next);
                  }}
                  placeholder="12 34 56 78"
                  type="tel"
                  inputMode="numeric"
                  maxLength={11}
                  className="w-28 border border-gray-200 rounded-lg px-2.5 py-2 text-xs"
                />
              </div>
            ))}
          </div>
        )}

        {/* Places : label + sélecteur sur une ligne */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 shrink-0">Places</span>
          <div className="flex items-center gap-0 flex-1 min-w-0">
            <button
              type="button"
              onClick={() => onPlacesAllerChange(Math.max(1, placesAller - 1))}
              className="w-7 h-7 rounded-l-lg border border-gray-300 bg-white hover:bg-gray-50 transition flex items-center justify-center shrink-0"
            >
              <Minus className="w-3 h-3 text-gray-600" />
            </button>
            <div className="flex-1 min-w-[2rem] h-7 border-y border-gray-300 bg-gray-50 flex items-center justify-center">
              <span className="text-sm font-bold text-gray-900">{placesAller}</span>
            </div>
            <button
              type="button"
              onClick={() => onPlacesAllerChange(placesAller + 1)}
              className="w-7 h-7 rounded-r-lg border border-gray-300 bg-white hover:bg-gray-50 transition flex items-center justify-center shrink-0"
            >
              <Plus className="w-3 h-3 text-gray-600" />
            </button>
          </div>
        </div>
        </div>

        {/* Total + CTA toujours visibles en bas */}
        <div className="shrink-0 space-y-1.5 mt-3 pt-3 border-t border-gray-100">
          <div className="rounded-lg p-3" style={{ background: `${primaryColor}08` }}>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-gray-600">Total à encaisser</span>
                {tariffMultiplier !== 1 && (
                  <p className="text-[10px] text-gray-400">
                    {TARIFF_OPTIONS.find((t) => t.key === tariffKey)?.label}
                  </p>
                )}
              </div>
              <span className="text-2xl font-bold tracking-tight" style={{ color: primaryColor }}>
                {formatMoney(totalPrice)}
              </span>
            </div>
          </div>

          {!canValidate && selectedTrip && validationHint && (
            <p className="text-[11px] text-center text-gray-400 px-1">{validationHint}</p>
          )}

          <button
            onClick={onValidate}
            disabled={!canValidate || isProcessing}
            className="w-full py-3 rounded-lg text-white font-semibold text-sm transition shadow-md disabled:shadow-none disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg active:scale-[0.99]"
            style={{ background: canValidate ? gradient : "#9CA3AF" }}
          >
            {isProcessing ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="w-4 h-4 animate-spin" /> Traitement…
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <ShoppingCart className="w-4 h-4" /> Encaisser
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── Quantity Selector ── */
const QuantitySelector: React.FC<{
  label: string;
  value: number;
  min: number;
  onChange: (n: number) => void;
  primaryColor: string;
}> = ({ label, value, min, onChange, primaryColor }) => (
  <div>
    <label className="block text-xs font-medium text-gray-500 mb-0.5">{label}</label>
    <div className="flex items-center gap-0">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-8 h-8 rounded-l-lg border border-gray-300 bg-white hover:bg-gray-50 transition flex items-center justify-center"
      >
        <Minus className="w-3.5 h-3.5 text-gray-600" />
      </button>
      <div className="flex-1 h-8 border-y border-gray-300 bg-gray-50 flex items-center justify-center min-w-[2rem]">
        <span className="text-sm font-bold text-gray-900">{value}</span>
      </div>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="w-8 h-8 rounded-r-lg border border-gray-300 bg-white hover:bg-gray-50 transition flex items-center justify-center"
      >
        <Plus className="w-3.5 h-3.5 text-gray-600" />
      </button>
    </div>
  </div>
);
