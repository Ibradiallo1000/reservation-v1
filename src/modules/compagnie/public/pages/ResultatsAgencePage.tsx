import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Bus, CalendarDays, Clock, Home, MapPin, Pencil, Ticket } from "lucide-react";
import { Company } from "@/types/companyTypes";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { buildValidTripsFromWeeklyTrips, ValidTrip } from "@/modules/compagnie/tripInstances/publicValidTripsService";
import { buildBookingHandoff, DepartureSort, selectCompanyDepartures, sortCompanyDepartures, validateCompanyDepartureCriteria } from "../companyDepartures";
import { usePublicSeo } from "@/modules/plateforme/public/usePublicSeo";

type Props = { company: Company; slug?: string; pathBase?: string };

function DepartureSkeleton() {
  return <div aria-busy="true" aria-label="Chargement des départs" className="space-y-3">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white motion-reduce:animate-none" />)}</div>;
}

export default function ResultatsAgencePage({ company, slug = company.slug ?? "", pathBase }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const money = useFormatCurrency();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const criteria = useMemo(() => ({ from: (params.get("from") ?? params.get("departure") ?? "").trim(), to: (params.get("to") ?? params.get("arrival") ?? "").trim(), date: (params.get("date") ?? "").trim() }), [params]);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const validation = useMemo(() => validateCompanyDepartureCriteria(criteria, today), [criteria, today]);
  const valid = Object.keys(validation).length === 0;
  const [trips, setTrips] = useState<ValidTrip[]>([]);
  const [loading, setLoading] = useState(valid);
  const [error, setError] = useState(false);
  const [sort, setSort] = useState<DepartureSort>("time");
  const departures = useMemo(() => sortCompanyDepartures(selectCompanyDepartures(trips, criteria), sort), [criteria, sort, trips]);
  const comparisonRoute = `/resultats?${new URLSearchParams({ from: criteria.from, to: criteria.to, date: criteria.date }).toString()}`;

  usePublicSeo({ title: valid ? `${company.nom} — ${criteria.from} vers ${criteria.to} | Teliya` : `${company.nom} — Recherche à modifier`, description: `Départs publics disponibles de ${company.nom}.`, canonicalPath: `/compagnie/${encodeURIComponent(slug)}/resultats`, robots: "noindex, follow" });

  useEffect(() => {
    if (!valid || !company.id) { setLoading(false); setTrips([]); return; }
    let cancelled = false;
    const todayDate = new Date(`${today}T12:00:00Z`);
    const targetDate = new Date(`${criteria.date}T12:00:00Z`);
    const daysAhead = Math.max(0, Math.min(59, Math.ceil((targetDate.getTime() - todayDate.getTime()) / 86_400_000)));
    setLoading(true); setError(false);
    void buildValidTripsFromWeeklyTrips({ companyId: company.id, depNorm: criteria.from, arrNorm: criteria.to, daysAhead, limitCount: 100 })
      .then(({ validTrips }) => { if (!cancelled) setTrips(validTrips); })
      .catch(() => { if (!cancelled) { setTrips([]); setError(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [company.id, criteria, today, valid]);

  const displayDate = criteria.date && !validation.date ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${criteria.date}T12:00:00Z`)) : criteria.date || "Date non renseignée";

  return (
    <div className="min-h-screen bg-slate-50 pb-[calc(4.5rem+env(safe-area-inset-bottom))] text-slate-950 md:pb-0">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white"><div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4"><Link to={comparisonRoute} aria-label="Retour aux compagnies" className="grid h-11 w-11 place-items-center rounded-xl hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-orange-500"><ArrowLeft /></Link><span className="max-w-[65%] truncate font-black">{company.nom}</span><span className="h-11 w-11" /></div></header>
      <main className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-8">
        <section className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">{company.logoUrl ? <img src={company.logoUrl} alt="" width="56" height="56" className="h-14 w-14 rounded-xl object-cover" /> : <span className="grid h-14 w-14 place-items-center rounded-xl bg-orange-50 text-orange-600"><Bus /></span>}<div><p className="text-xs font-bold uppercase tracking-wide text-orange-700">Compagnie sélectionnée</p><h1 className="text-xl font-black">{company.nom}</h1></div></section>
        <section aria-labelledby="route-title" className="mt-4 rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><h2 id="route-title" className="font-black">{criteria.from || "Départ"} <ArrowRight className="inline h-4 w-4 text-orange-600" /> {criteria.to || "Arrivée"}</h2><p className="mt-2 flex items-center gap-2 text-sm text-slate-600"><CalendarDays className="h-4 w-4" />{displayDate}</p></div><Link to={comparisonRoute} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-3 text-sm font-bold"><Pencil className="h-4 w-4" />Modifier</Link></div></section>

        {!valid ? <section role="alert" className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-5"><h2 className="font-bold text-rose-900">Critères invalides</h2><ul className="mt-2 list-disc pl-5 text-sm text-rose-800">{Object.values(validation).map((message) => <li key={message}>{message}</li>)}</ul><Link to={comparisonRoute} className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-4 font-bold text-white">Revenir à la comparaison</Link></section> : <>
          <div className="mt-7 flex items-end justify-between gap-3"><div><h2 className="text-2xl font-black">Départs disponibles</h2><p role="status" className="mt-1 text-sm text-slate-600">{loading ? "Chargement des départs…" : `${departures.length} départ${departures.length > 1 ? "s" : ""}`}</p></div><label className="grid gap-1 text-sm font-semibold"><span>Trier par</span><select value={sort} onChange={(event) => setSort(event.target.value as DepartureSort)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3"><option value="time">Horaire</option><option value="price">Prix</option></select></label></div>
          <div className="mt-5">{loading ? <DepartureSkeleton /> : error ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5"><h3 className="font-bold text-rose-900">Impossible de charger les départs</h3><p className="mt-1 text-sm text-rose-800">Vérifiez votre connexion puis réessayez.</p></div> : departures.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center"><Clock className="mx-auto h-8 w-8 text-slate-400" /><h3 className="mt-3 font-bold">Aucun départ de cette compagnie ne correspond à votre recherche.</h3><div className="mt-4 flex flex-wrap justify-center gap-3"><Link to={comparisonRoute} className="inline-flex min-h-11 items-center rounded-xl bg-orange-600 px-4 font-bold text-white">Voir les autres compagnies</Link><Link to={`/?from=${encodeURIComponent(criteria.from)}&to=${encodeURIComponent(criteria.to)}&date=${encodeURIComponent(criteria.date)}`} className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 font-bold">Modifier la recherche</Link></div></div> : <ul className="space-y-3">{departures.map((departure) => { const handoff = buildBookingHandoff({ slug, pathBase, departure, company: { id: company.id, nom: company.nom, logoUrl: company.logoUrl } }); const bookable = departure.availabilityStatus !== "unavailable"; return <li key={`${departure.id}-${departure.date}-${departure.time}`}><article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-2 text-2xl font-black"><Clock className="h-5 w-5 text-orange-600" />{departure.time}</p><p className="mt-2 flex items-center gap-2 text-sm text-slate-600"><MapPin className="h-4 w-4" />{departure.departure} → {departure.arrival}</p></div><div className="text-right"><span className="block text-xs text-slate-500">Prix</span><strong className="text-xl text-orange-700">{departure.price > 0 ? money(departure.price) : "Prix indisponible"}</strong></div></div><p className="mt-3 text-sm text-slate-600">{departure.availabilityStatus === "confirmed" ? `${departure.remainingSeats} place${departure.remainingSeats > 1 ? "s" : ""} disponible${departure.remainingSeats > 1 ? "s" : ""}` : departure.availabilityStatus === "unavailable" ? "Complet" : "Disponibilité à vérifier"}</p><button type="button" disabled={!bookable} onClick={() => navigate(handoff.route, { state: handoff.state })} className="mt-4 min-h-11 w-full rounded-xl bg-orange-600 px-4 font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600">{bookable ? "Réserver" : "Complet"}</button></article></li>; })}</ul>}</div>
        </>}
      </main>
      <nav aria-label="Navigation basse" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"><Link to="/" className="flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-slate-600"><Home className="h-5 w-5" />Accueil</Link><Link to="/mes-reservations" className="flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-slate-600"><Ticket className="h-5 w-5" />Réservations</Link></nav>
    </div>
  );
}
