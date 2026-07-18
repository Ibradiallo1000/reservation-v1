import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Bus, CalendarDays, CheckCircle2, MapPin, Search, ShieldCheck } from "lucide-react";
import { buildMarketplaceResultsRoute } from "./publicRoutes";
import { usePublicSeo } from "./usePublicSeo";

const benefits = [
  { icon: Search, title: "Comparer simplement", text: "Consultez les compagnies qui proposent réellement le trajet recherché." },
  { icon: ShieldCheck, title: "Réserver en confiance", text: "Poursuivez dans le parcours public sécurisé de la compagnie choisie." },
  { icon: CheckCircle2, title: "Informations utiles", text: "Horaires, prix et places disponibles restent issus des données existantes." },
];

const faqs = [
  ["Comment trouver un trajet ?", "Indiquez votre ville de départ, votre destination et, si besoin, la date souhaitée."],
  ["Puis-je comparer plusieurs compagnies ?", "Oui. Les résultats regroupent uniquement les compagnies disposant d'un trajet compatible."],
  ["Où se termine la réservation ?", "Après votre choix, la réservation continue dans l'espace public de la compagnie."],
];

export default function MarketplaceHomePage() {
  const navigate = useNavigate();
  const [departure, setDeparture] = useState("");
  const [arrival, setArrival] = useState("");
  const [date, setDate] = useState("");
  usePublicSeo({
    title: "Teliya — Comparez et réservez votre trajet",
    description: "Recherchez un trajet, comparez les compagnies disponibles et continuez votre réservation en ligne.",
    canonicalPath: "/",
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!departure.trim() || !arrival.trim()) return;
    navigate(buildMarketplaceResultsRoute({ departure, arrival, date }));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <nav aria-label="Navigation principale" className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <a href="/" className="flex items-center gap-2 font-black text-xl text-orange-600"><Bus aria-hidden="true" /> Teliya</a>
          <a href="/landing" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500">Découvrir Teliya</a>
        </nav>
      </header>

      <main>
        <section className="bg-gradient-to-br from-orange-600 via-orange-500 to-amber-400 px-4 py-14 text-white sm:py-20">
          <div className="mx-auto max-w-6xl">
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-orange-100">Voyagez simplement</p>
            <h1 className="max-w-3xl text-4xl font-black leading-tight sm:text-5xl">Trouvez le trajet qui vous convient</h1>
            <p className="mt-4 max-w-2xl text-lg text-orange-50">Comparez les compagnies disponibles sans ressaisir votre recherche.</p>

            <form onSubmit={submit} aria-label="Rechercher un trajet" className="mt-8 grid gap-3 rounded-2xl bg-white p-4 text-slate-900 shadow-xl md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
              <label className="grid gap-1.5 text-sm font-semibold"><span>Départ</span><span className="relative"><MapPin className="absolute left-3 top-3 h-5 w-5 text-slate-400" aria-hidden="true" /><input required value={departure} onChange={(e) => setDeparture(e.target.value)} className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200" placeholder="Bamako" /></span></label>
              <label className="grid gap-1.5 text-sm font-semibold"><span>Arrivée</span><span className="relative"><MapPin className="absolute left-3 top-3 h-5 w-5 text-slate-400" aria-hidden="true" /><input required value={arrival} onChange={(e) => setArrival(e.target.value)} className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200" placeholder="Ségou" /></span></label>
              <label className="grid gap-1.5 text-sm font-semibold"><span>Date</span><span className="relative"><CalendarDays className="absolute left-3 top-3 h-5 w-5 text-slate-400" aria-hidden="true" /><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200" /></span></label>
              <button className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-2.5 font-bold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500"><Search className="h-5 w-5" aria-hidden="true" /> Rechercher</button>
            </form>
          </div>
        </section>

        <section aria-labelledby="why-title" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 id="why-title" className="text-2xl font-black sm:text-3xl">Pourquoi réserver avec Teliya ?</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">{benefits.map(({ icon: Icon, title, text }) => <article key={title} className="rounded-2xl border border-slate-200 bg-white p-6"><Icon className="h-7 w-7 text-orange-600" aria-hidden="true" /><h3 className="mt-4 font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></article>)}</div>
        </section>

        <section aria-labelledby="faq-title" className="bg-white px-4 py-14 sm:px-6">
          <div className="mx-auto max-w-4xl"><h2 id="faq-title" className="text-2xl font-black sm:text-3xl">Questions fréquentes</h2><div className="mt-6 divide-y divide-slate-200 rounded-2xl border border-slate-200">{faqs.map(([question, answer]) => <details key={question} className="group p-5"><summary className="flex cursor-pointer list-none items-center justify-between font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">{question}<ArrowRight className="h-5 w-5 transition group-open:rotate-90" aria-hidden="true" /></summary><p className="mt-3 pr-8 text-sm leading-6 text-slate-600">{answer}</p></details>)}</div></div>
        </section>
      </main>

      <footer className="bg-slate-950 px-4 py-8 text-slate-300"><div className="mx-auto flex max-w-6xl flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between"><span>© Teliya</span><div className="flex gap-4"><a className="hover:text-white" href="/landing">À propos</a><a className="hover:text-white" href="/login">Connexion</a></div></div></footer>
    </div>
  );
}
