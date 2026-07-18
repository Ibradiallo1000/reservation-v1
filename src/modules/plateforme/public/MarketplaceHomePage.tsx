import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Bus, CalendarDays, CheckCircle2, HelpCircle, Home, Menu, Search, Ticket, X } from "lucide-react";
import { buildMarketplaceResultsRoute } from "./publicRoutes";
import { validateMarketplaceSearch } from "./marketplaceData";
import { useMarketplaceData } from "./useMarketplaceData";
import { usePublicSeo } from "./usePublicSeo";
import PublicCityCombobox from "./PublicCityCombobox";
import { isSupportedCountryCode } from "@/config/supportedCountries";

const benefits = [
  [Search, "Comparer les compagnies", "La comparaison affiche les compagnies qui proposent le trajet recherché."],
  [CheckCircle2, "Réserver plus simplement", "Vos critères restent conservés jusqu’au choix du départ."],
  [Ticket, "Retrouver ses réservations", "L’accès public permet de retrouver une réservation ou un billet existant."],
] as const;

const faqs = [
  ["Comment rechercher un trajet ?", "Sélectionnez le départ, l’arrivée et la date, puis lancez la recherche."],
  ["Comment réserver un billet ?", "Choisissez une compagnie dans les résultats, puis un départ disponible dans son espace public."],
  ["Comment retrouver ma réservation ?", "Utilisez la page Mes réservations avec les informations demandées par le parcours public."],
] as const;

function LoadingCards({ count = 4 }: { count?: number }) {
  return <div aria-label="Chargement" className="flex gap-3 overflow-hidden">{Array.from({ length: count }).map((_, index) => <div key={index} className="h-28 min-w-56 animate-pulse rounded-xl bg-slate-200 motion-reduce:animate-none" />)}</div>;
}

export default function MarketplaceHomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { cities, routes, companies, countries, selectedCountryCode, setSelectedCountryCode, diagnostics, retry } = useMarketplaceData();
  const [departure, setDeparture] = useState(() => searchParams.get("from") ?? "");
  const [arrival, setArrival] = useState(() => searchParams.get("to") ?? "");
  const [departureSelected, setDepartureSelected] = useState(false);
  const [arrivalSelected, setArrivalSelected] = useState(false);
  const [date, setDate] = useState(() => searchParams.get("date") ?? "");
  const [errors, setErrors] = useState<ReturnType<typeof validateMarketplaceSearch>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  usePublicSeo({ title: "Teliya — Trouvez votre prochain trajet", description: "Recherchez un trajet et comparez les compagnies publiques disponibles sur Teliya.", canonicalPath: "/" });

  const search = (nextDeparture = departure, nextArrival = arrival, nextDate = date, trustedSuggestion = false) => {
    const validation = validateMarketplaceSearch(nextDeparture, nextArrival, nextDate, today, cities.data);
    if (!trustedSuggestion && nextDeparture === departure && !departureSelected) validation.departure = "Sélectionnez une ville dans la liste.";
    if (!trustedSuggestion && nextArrival === arrival && !arrivalSelected) validation.arrival = "Sélectionnez une ville dans la liste.";
    setErrors(validation);
    if (Object.keys(validation).length) return;
    navigate(buildMarketplaceResultsRoute({ departure: nextDeparture, arrival: nextArrival, date: nextDate }));
  };

  const submit = (event: FormEvent) => { event.preventDefault(); search(); };

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 pb-[calc(4.5rem+env(safe-area-inset-bottom))] text-slate-950 md:pb-0">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <nav aria-label="Navigation principale" className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-current="page" className="flex items-center gap-2 text-xl font-black text-orange-600"><Bus aria-hidden="true" /> Teliya</Link>
          <div className="hidden items-center gap-1 md:flex">
            <a href="#search" className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-slate-100">Réserver</a>
            <a href="#destinations" className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-slate-100">Destinations</a>
            <a href="#companies" className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-slate-100">Compagnies</a>
            <a href="#help" className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-slate-100">Aide</a>
            <Link to="/mes-reservations" className="ml-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white">Mes réservations</Link>
          </div>
          <button type="button" aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 md:hidden">{menuOpen ? <X /> : <Menu />}</button>
        </nav>
        {menuOpen ? <nav aria-label="Navigation mobile" className="border-t border-slate-100 bg-white px-4 py-3 md:hidden"><div className="mx-auto grid max-w-6xl gap-1"><a href="#destinations" onClick={() => setMenuOpen(false)} className="min-h-11 rounded-lg px-3 py-3 font-semibold">Destinations</a><a href="#companies" onClick={() => setMenuOpen(false)} className="min-h-11 rounded-lg px-3 py-3 font-semibold">Compagnies</a><Link to="/mes-reservations" className="min-h-11 rounded-lg px-3 py-3 font-semibold">Mes réservations</Link></div></nav> : null}
      </header>

      <main>
        <section className="bg-orange-600 px-4 py-8 text-white sm:px-6 sm:py-12">
          <div className="mx-auto grid max-w-6xl gap-7 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div><p className="text-sm font-bold uppercase tracking-widest text-orange-100">Voyagez avec Teliya</p><h1 className="mt-2 max-w-xl text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">Trouvez votre prochain trajet</h1><p className="mt-3 max-w-lg text-base leading-7 text-orange-50">Recherchez une destination et comparez les compagnies réellement disponibles.</p></div>
            <form id="search" onSubmit={submit} noValidate aria-label="Rechercher un trajet" className="grid gap-3 rounded-2xl bg-white p-4 text-slate-900 shadow-lg sm:grid-cols-2 lg:grid-cols-[1fr_1fr_0.8fr]">
              {countries.length > 1 ? <label className="sm:col-span-2 lg:col-span-3"><span className="mb-1.5 block text-sm font-semibold">Pays</span><select value={selectedCountryCode ?? ""} onChange={(event) => { setSelectedCountryCode(isSupportedCountryCode(event.target.value) ? event.target.value : null); setDeparture(""); setArrival(""); setDepartureSelected(false); setArrivalSelected(false); }} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus-visible:border-orange-500 focus-visible:ring-2 focus-visible:ring-orange-200"><option value="">Tous les pays disponibles</option>{countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label> : null}
              <PublicCityCombobox label="Ville de départ" value={departure} onChange={(value, selected) => { setDeparture(value); setDepartureSelected(selected); setErrors((current) => ({ ...current, departure: undefined })); }} cities={cities.data} disabled={cities.loading || cities.error} error={errors.departure} exclude={arrival} />
              <PublicCityCombobox label="Ville d’arrivée" value={arrival} onChange={(value, selected) => { setArrival(value); setArrivalSelected(selected); setErrors((current) => ({ ...current, arrival: undefined })); }} cities={cities.data} disabled={cities.loading || cities.error} error={errors.arrival} exclude={departure} />
              <div><label htmlFor="travel-date" className="mb-1.5 block text-sm font-semibold">Date du voyage</label><div className="relative"><CalendarDays className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" aria-hidden="true" /><input id="travel-date" type="date" min={today} value={date} onChange={(event) => setDate(event.target.value)} aria-invalid={Boolean(errors.date)} aria-describedby={errors.date ? "date-error" : undefined} className="min-h-11 w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-base outline-none focus-visible:border-orange-500 focus-visible:ring-2 focus-visible:ring-orange-200" /></div>{errors.date ? <p id="date-error" className="mt-1 text-sm font-medium text-rose-700">{errors.date}</p> : null}</div>
              {cities.loading ? <p role="status" className="text-sm text-slate-600 sm:col-span-2 lg:col-span-3">Chargement des villes disponibles…</p> : null}
              {cities.error ? <div role="alert" className="flex items-center justify-between gap-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800 sm:col-span-2 lg:col-span-3"><span>Données temporairement indisponibles.</span><button type="button" onClick={retry} className="font-bold underline">Réessayer</button></div> : null}
              {!cities.loading && !cities.error && cities.data.length === 0 ? <p role="status" className="text-sm text-slate-600 sm:col-span-2 lg:col-span-3">Aucune ville publique disponible.</p> : null}
              <button disabled={cities.loading || cities.error || cities.data.length === 0} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2 lg:col-span-3"><Search className="h-5 w-5" aria-hidden="true" /> Rechercher</button>
            </form>
          </div>
        </section>

        <section id="destinations" aria-labelledby="destinations-title" className="mx-auto max-w-6xl px-4 py-10 sm:px-6"><h2 id="destinations-title" className="text-2xl font-black">Destinations populaires</h2><p className="mt-1 text-sm text-slate-600">Classées selon le nombre de trajets publics actifs disponibles.</p><div className="mt-5">{routes.loading ? <LoadingCards /> : routes.error ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Destinations temporairement indisponibles.</p> : routes.data.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Aucune destination disponible.</p> : <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-4">{routes.data.map((route) => <button type="button" key={`${route.departure}-${route.arrival}`} onClick={() => { setDeparture(route.departure); setArrival(route.arrival); if (date) search(route.departure, route.arrival, date); else document.getElementById("travel-date")?.focus(); }} aria-label={`Rechercher de ${route.departure} à ${route.arrival}`} className="min-w-64 snap-start rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-orange-300 focus-visible:ring-2 focus-visible:ring-orange-500 sm:min-w-0"><span className="font-bold">{route.departure} <ArrowRight className="inline h-4 w-4" aria-hidden="true" /> {route.arrival}</span><span className="mt-2 block text-xs text-slate-500">{route.tripCount} trajet{route.tripCount > 1 ? "s" : ""} actif{route.tripCount > 1 ? "s" : ""}</span></button>)}</div>}</div></section>

        <section id="companies" aria-labelledby="companies-title" className="border-y border-slate-200 bg-white"><div className="mx-auto max-w-6xl px-4 py-10 sm:px-6"><h2 id="companies-title" className="text-2xl font-black">Compagnies partenaires</h2><p className="mt-1 text-sm text-slate-600">Compagnies actives disposant d’une page publique.</p><div className="mt-5">{companies.loading ? <LoadingCards /> : companies.error ? <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">Compagnies temporairement indisponibles.</p> : companies.data.length === 0 ? <p className="rounded-xl border border-slate-200 p-4 text-sm text-slate-600">Aucune compagnie partenaire disponible.</p> : <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-4">{companies.data.map((company) => <Link key={company.slug} to={`/${company.slug}`} className="flex min-w-64 snap-start items-center gap-3 rounded-xl border border-slate-200 p-4 hover:border-orange-300 focus-visible:ring-2 focus-visible:ring-orange-500 sm:min-w-0">{company.logoUrl ? <img src={company.logoUrl} alt="" width="56" height="56" loading="lazy" decoding="async" className="h-14 w-14 rounded-xl object-cover" /> : <span aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-600"><Bus /></span>}<span className="min-w-0"><strong className="block truncate">{company.name}</strong>{company.description ? <span className="mt-1 line-clamp-2 block text-xs text-slate-600">{company.description}</span> : null}<span className="mt-1 block text-xs text-slate-500">{company.tripCount} trajet{company.tripCount > 1 ? "s" : ""} public{company.tripCount > 1 ? "s" : ""}</span></span></Link>)}</div>}</div></div></section>

        <section aria-labelledby="benefits-title" className="mx-auto max-w-6xl px-4 py-10 sm:px-6"><h2 id="benefits-title" className="text-2xl font-black">Pourquoi utiliser Teliya ?</h2><div className="mt-5 grid gap-3 md:grid-cols-3">{benefits.map(([Icon, title, text]) => <article key={title} className="rounded-xl border border-slate-200 bg-white p-5"><Icon className="h-6 w-6 text-orange-600" aria-hidden="true" /><h3 className="mt-3 font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></article>)}</div></section>
        <section id="help" aria-labelledby="help-title" className="bg-white"><div className="mx-auto max-w-4xl px-4 py-10 sm:px-6"><h2 id="help-title" className="text-2xl font-black">Questions fréquentes</h2><div className="mt-5 divide-y divide-slate-200 rounded-xl border border-slate-200">{faqs.map(([question, answer]) => <details key={question} className="group p-4"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-bold focus-visible:ring-2 focus-visible:ring-orange-500">{question}<ArrowRight className="h-5 w-5 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" /></summary><p className="mt-2 pr-7 text-sm leading-6 text-slate-600">{answer}</p></details>)}</div></div></section>
      </main>

      <footer className="bg-slate-950 px-4 py-8 text-sm text-slate-300"><div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:justify-between"><strong className="text-white">Teliya</strong><nav aria-label="Pied de page" className="flex flex-wrap gap-x-5 gap-y-3"><Link to="/">Accueil</Link><a href="#search">Réserver</a><a href="#help">Aide</a><Link to="/landing">À propos</Link><Link to="/mes-reservations">Mes réservations</Link></nav></div></footer>
      {import.meta.env.DEV ? <details className="fixed bottom-20 right-3 z-50 max-w-xs rounded-lg border border-slate-300 bg-white p-3 text-xs text-slate-700 shadow-xl"><summary className="cursor-pointer font-bold">Diagnostic public DEV</summary><dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1"><dt>Compagnies lues</dt><dd>{diagnostics.companiesLoaded}/{diagnostics.companyReadLimit}</dd><dt>Partenaires éligibles</dt><dd>{diagnostics.eligiblePartners}</dd><dt>Trajets actifs</dt><dd>{diagnostics.activeTrips}/{diagnostics.tripReadLimit}</dd><dt>Villes publiques</dt><dd>{diagnostics.publicCities}</dd></dl></details> : null}
      <nav aria-label="Navigation basse" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_8px_rgba(15,23,42,0.08)] md:hidden"><Link to="/" aria-current="page" className="flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-orange-600"><Home className="h-5 w-5" />Accueil</Link><Link to="/mes-reservations" className="flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-slate-600"><Ticket className="h-5 w-5" />Réservations</Link><a href="#help" className="flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-slate-600"><HelpCircle className="h-5 w-5" />Aide</a></nav>
    </div>
  );
}
