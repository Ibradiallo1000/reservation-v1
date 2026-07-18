import { KeyboardEvent, useId, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { suggestPublicCities } from "./marketplaceData";

type Props = {
  label: string;
  value: string;
  cities: string[];
  disabled?: boolean;
  error?: string;
  exclude?: string;
  onChange: (value: string, selected: boolean) => void;
};

export default function PublicCityCombobox({ label, value, cities, disabled, error, exclude, onChange }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const options = useMemo(() => suggestPublicCities(cities, value, exclude), [cities, exclude, value]);

  const choose = (city: string) => {
    onChange(city, true);
    setOpen(false);
    setActiveIndex(0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") { setOpen(false); return; }
    if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActiveIndex((index) => Math.min(index + 1, options.length - 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); }
    if (event.key === "Enter" && open && options[activeIndex]) { event.preventDefault(); choose(options[activeIndex]); }
  };

  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-slate-800">{label}</label>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" aria-hidden="true" />
        <input
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          aria-activedescendant={open && options[activeIndex] ? `${id}-option-${activeIndex}` : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          autoComplete="off"
          disabled={disabled}
          value={value}
          onChange={(event) => { onChange(event.target.value, false); setOpen(true); setActiveIndex(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          className="min-h-11 w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-base outline-none focus-visible:border-orange-500 focus-visible:ring-2 focus-visible:ring-orange-200 disabled:bg-slate-100"
        />
      </div>
      {open && !disabled ? (
        <ul id={`${id}-listbox`} role="listbox" className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          {options.length ? options.map((city, index) => (
            <li id={`${id}-option-${index}`} key={city} role="option" aria-selected={index === activeIndex}>
              <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(city)} className={`min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm ${index === activeIndex ? "bg-orange-50 text-orange-800" : "hover:bg-slate-50"}`}>{city}</button>
            </li>
          )) : <li className="px-3 py-3 text-sm text-slate-500">Aucune ville correspondante</li>}
        </ul>
      ) : null}
      {error ? <p id={`${id}-error`} className="mt-1 text-sm font-medium text-rose-700">{error}</p> : null}
    </div>
  );
}
