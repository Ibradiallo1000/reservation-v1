import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Bus, CalendarDays, Home, Pencil, Search, Ticket } from "lucide-react";
import { formatCurrency } from "@/shared/utils/formatCurrency";
import { buildCompanyResultsRoute, buildMarketplaceResultsRoute } from "@/modules/plateforme/public/publicRoutes";
import { ComparisonCriteria, ComparisonSort, sortCompanyComparisons, validateComparisonCriteria, weekdayKey } from "@/modules/plateforme/public/companyComparison";
import { useCompanyComparison } from "@/modules/plateforme/public/useCompanyComparison";
import { usePublicSeo } from "@/modules/plateforme/public/usePublicSeo";

function ResultsSkeleton() {
  return <div aria-busy="true" aria-label="Chargement des compagnies" className="space-y-3">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white motion-reduce:animate-none" />)}</div>;
}

export default function PlatformSearchResultsPage() {
  const [params] = useSearchParams();
  const criteria = useMemo<ComparisonCriteria>(() => ({ from: params.get("from")?.trim() ?? "", to: params.get("to")?.trim() ?? "", date: params.get("date")?.trim() ?? "" }), [params]);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const validation = useMemo(() => validateComparisonCriteria(criteria, today), [criteria, today]);
  const valid = Object.keys(validation).length === 0;
  const comparison = useCompanyComparison(criteria, valid);
  const [sort, setSort] = useState<ComparisonSort>("price");
  const results = useMemo(() => sortCompanyComparisons(comparison.results, sort), [comparison.results, sort]);
  const editRoute = buildMarketplaceResultsRoute({ departure: criteria.from, arrival: criteria.to, date: criteria.date });
  const displayDate = criteria.date && weekdayKey(criteria.date)
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${criteria.date}T12:00:00Z`))
    : criteria.date || "Date non renseignée";

  usePublicSeo({ title: valid ? `${criteria.from} vers ${criteria.to} — Compagnies disponibles | Teliya` : "Recherche à modifier | Teliya", description: "Comparez les compagnies proposant le trajet recherché.", canonicalPath: "/resultats", robots: "noindex, follow" });

  return (
    <div className="min-h-screen bg-slate-50 pb-[calc(4.5rem+env(safe-area-inset-bottom))] text-slate-950 md:pb-0">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white"><div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4"><Link to={editRoute} aria-label="Retour à la recherche" className="grid h-11 w-11 place-items-center rounded-xl hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-orange-500"><ArrowLeft /></Link><span className="font-black">Résultats</span><span className="h-11 w-11" aria-hidden="true" /></div></header>
      <main className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-8">
        <section aria-labelledby="search-summary" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><h1 id="search-summary" className="text-lg font-black sm:text-xl">{criteria.from || "Départ"} <ArrowRight className="inline h-5 w-5 text-orange-600" aria-hidden="true" /> {criteria.to || "Arrivée"}</h1><p className="mt-2 flex items-center gap-2 text-sm text-slate-600"><CalendarDays className="h-4 w-4" aria-hidden="true" />{displayDate}</p></div><Link to={`/?from=${encodeURIComponent(criteria.from)}&to=${encodeURIComponent(criteria.to)}&date=${encodeURIComponent(criteria.date)}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-3 text-sm font-bold hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-orange-500"><Pencil className="h-4 w-4" /> Modifier</Link></div>
        </section>

        {!valid ? <section role="alert" className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-5"><h2 className="font-bold text-rose-900">Critères de recherche invalides</h2><ul className="mt-2 list-disc pl-5 text-sm text-rose-800">{Object.values(validation).map((message) => <li key={message}>{message}</li>)}</ul><Link to={`/?from=${encodeURIComponent(criteria.from)}&to=${encodeURIComponent(criteria.to)}&date=${encodeURIComponent(criteria.date)}`} className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-4 font-bold text-white">Modifier la recherche</Link></section> : (
          <>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-2xl font-black">Compagnies disponibles</h2><p role="status" className="mt-1 text-sm text-slate-600">{comparison.loading ? "Recherche des offres…" : `${results.length} compagnie${results.length > 1 ? "s" : ""} propose${results.length > 1 ? "nt" : ""} ce trajet`}</p></div><label className="grid gap-1 text-sm font-semibold"><span>Trier par</span><select value={sort} onChange={(event) => setSort(event.target.value as ComparisonSort)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 focus-visible:ring-2 focus-visible:ring-orange-500"><option value="price">Prix croissant</option><option value="time">Prochain départ</option><option value="departures">Nombre de départs</option><option value="name">Nom</option></select></label></div>
            <div className="mt-5">{comparison.loading ? <ResultsSkeleton /> : comparison.error ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5"><h3 className="font-bold text-rose-900">Impossible de charger les trajets</h3><p className="mt-1 text-sm text-rose-800">Vérifiez votre connexion puis réessayez.</p></div> : results.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center"><Search className="mx-auto h-8 w-8 text-slate-400" /><h3 className="mt-3 font-bold">Aucune compagnie ne propose ce trajet à cette date.</h3><p className="mt-2 text-sm text-slate-600">Modifiez le départ, l’arrivée ou la date sans élargissement automatique.</p><Link to={`/?from=${encodeURIComponent(criteria.from)}&to=${encodeURIComponent(criteria.to)}&date=${encodeURIComponent(criteria.date)}`} className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-orange-600 px-4 font-bold text-white">Modifier la recherche</Link></div> : <ul className="space-y-3">{results.map((company) => <li key={company.slug}><article aria-labelledby={`company-${company.slug}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-start gap-3">{company.logoUrl ? <img src={company.logoUrl} alt="" width="56" height="56" loading="lazy" decoding="async" className="h-14 w-14 rounded-xl object-cover" /> : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-600"><Bus aria-hidden="true" /></span>}<div className="min-w-0 flex-1"><h3 id={`company-${company.slug}`} className="truncate text-lg font-black">{company.name}</h3><p className="mt-1 text-sm text-slate-600">{company.departureCount} départ{company.departureCount > 1 ? "s" : ""} disponible{company.departureCount > 1 ? "s" : ""}</p>{company.nextDepartureTime ? <p className="mt-1 text-sm text-slate-600">Prochain départ : <strong>{company.nextDepartureTime}</strong></p> : null}</div><div className="text-right"><span className="block text-xs text-slate-500">À partir de</span><strong className="text-lg text-orange-700">{company.minimumPrice ? formatCurrency(company.minimumPrice, company.currency) : "Prix indisponible"}</strong></div></div>{!company.availabilityConfirmed ? <p className="mt-3 text-xs text-slate-500">Horaires issus de la programmation active ; disponibilité détaillée à confirmer.</p> : null}<Link to={buildCompanyResultsRoute(company.slug, { departure: criteria.from, arrival: criteria.to, date: criteria.date })} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 font-bold text-white hover:bg-orange-700 focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2">Voir les départs <ArrowRight className="h-4 w-4" /></Link></article></li>)}</ul>}{comparison.partial && !comparison.loading ? <p role="status" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Certaines informations de départ sont temporairement indisponibles.</p> : null}</div>
          </>
        )}
      </main>
      <nav aria-label="Navigation basse" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-2 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"><Link to="/" className="flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-slate-600"><Home className="h-5 w-5" />Accueil</Link><Link to="/mes-reservations" className="flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-slate-600"><Ticket className="h-5 w-5" />Réservations</Link></nav>
    </div>
  );
}
