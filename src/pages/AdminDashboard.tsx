import React, { useEffect, useMemo, useState } from "react";
import { collection, collectionGroup, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp, TrendingDown, Building2, Users, AlertTriangle, DollarSign, BarChart2, Download
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, YAxis, XAxis, Tooltip, Legend, CartesianGrid
} from "recharts";

/* ==== Types & utils (identiques) ==== */
interface Company { id: string; nom: string; slug: string; plan: string; status: string; createdAt?: { seconds: number }; }
interface Reservation {
  montant?: number; total?: number; commission?: number; statut?: string;
  createdAt?: { seconds: number }; companyId?: string; companyName?: string;
  depart?: string; arrivee?: string; from?: string; to?: string; origin?: string; destination?: string; routeName?: string;
}
const nf = new Intl.NumberFormat("fr-FR");
const fmtFCFA = (n: number) => `${nf.format(n || 0)} FCFA`;
const toNum = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const addDays = (d: Date, n: number) => { const t = new Date(d); t.setDate(t.getDate()+n); return t; };
const buildEmptyDailyRange = (start: Date, end: Date) => { const arr: {date:string;gmv:number;reservations:number}[]=[]; let cur=new Date(start); while(cur<=end){arr.push({date:dayKey(cur),gmv:0,reservations:0}); cur=addDays(cur,1);} return arr; };
const extractRouteLabel = (d: Reservation) => { const dep=d.depart||d.from||d.origin||""; const arr=d.arrivee||d.to||d.destination||""; if(dep&&arr) return `${dep} → ${arr}`; if(d.routeName) return d.routeName; return "Trajet inconnu"; };

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();

  const [periode, setPeriode] = useState<"7j"|"30j"|"tout">("30j");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("__all__");
  const [stats, setStats] = useState({ total:0, commission:0, reservations:0, annulations:0, compagnies:0, nouvellesCompagnies:0 });
  const [series, setSeries] = useState<{date:string;gmv:number;reservations:number}[]>([]);
  const [topCompanies, setTopCompanies] = useState<{id:string;name:string;gmv:number;reservations:number}[]>([]);
  const [topDestinations, setTopDestinations] = useState<{route:string;gmv:number;reservations:number}[]>([]);

  useEffect(() => {
    const run = async () => {
      const companiesSnap = await getDocs(collection(db, "companies"));
      const comps: Company[] = companiesSnap.docs.map(doc => ({
        id: doc.id,
        nom: doc.data().nom || "Compagnie",
        slug: doc.data().slug || "—",
        plan: doc.data().plan || "free",
        status: doc.data().status || "actif",
        createdAt: doc.data().createdAt,
      }));
      setCompanies(comps);

      const resSnap = await getDocs(collectionGroup(db, "reservations"));
      const now = new Date();
      let start: Date | null = null;
      if (periode === "7j") start = addDays(new Date(now), -6);
      else if (periode === "30j") start = addDays(new Date(now), -29);

      const empty = start ? buildEmptyDailyRange(start, now) : [];
      const daily = new Map<string, {gmv:number; reservations:number}>();
      empty.forEach(r => daily.set(r.date, { gmv:0, reservations:0 }));

      let total=0, commission=0, reservations=0, annulations=0;
      const companyAgg: Record<string,{id:string;name:string;gmv:number;reservations:number}> = {};
      const routeAgg: Record<string,{route:string;gmv:number;reservations:number}> = {};

      for (const doc of resSnap.docs) {
        const d = doc.data() as Reservation;
        const montant = toNum(d.total ?? d.montant);
        const comm = toNum(d.commission);
        const createdMs = d.createdAt?.seconds ? d.createdAt.seconds * 1000 : null;

        if (start && createdMs) {
          const created = new Date(createdMs);
          if (created < start || created > now) continue;
        }
        if (selectedCompanyId !== "__all__" && (d.companyId ?? "") !== selectedCompanyId) continue;

        reservations++; total += montant; commission += comm;
        if (d.statut === "annulé") annulations++;

        if (createdMs) {
          const k = dayKey(new Date(createdMs));
          const cur = daily.get(k) ?? { gmv:0, reservations:0 };
          cur.gmv += montant; cur.reservations += 1; daily.set(k, cur);
        }
        const cId = d.companyId || "inconnu";
        if (!companyAgg[cId]) companyAgg[cId] = { id:cId, name:d.companyName || "Compagnie", gmv:0, reservations:0 };
        companyAgg[cId].gmv += montant;
        companyAgg[cId].reservations += 1;

        const label = extractRouteLabel(d);
        if (!routeAgg[label]) routeAgg[label] = { route:label, gmv:0, reservations:0 };
        routeAgg[label].gmv += montant;
        routeAgg[label].reservations += 1;
      }

      const finalSeries = Array.from(daily.entries()).sort((a,b)=>a[0]<b[0]? -1:1).map(([date,v])=>({date,...v}));
      const top = selectedCompanyId !== "__all__"
        ? Object.values(companyAgg).filter(c => c.id === selectedCompanyId).slice(0,1)
        : Object.values(companyAgg).sort((a,b)=>b.gmv-a.gmv).slice(0,5);
      const topRoutes = Object.values(routeAgg).sort((a,b)=>b.gmv-a.gmv || b.reservations-a.reservations).slice(0,5);

      setSeries(finalSeries);
      setTopCompanies(top);
      setTopDestinations(topRoutes);
      setStats({
        total, commission, reservations, annulations,
        compagnies: selectedCompanyId === "__all__" ? comps.length : 1,
        nouvellesCompagnies: 0,
      });
    };
    run();
  }, [periode, selectedCompanyId]);

  const kpis = useMemo(() => ([
    { label: "Montant encaissé", value: fmtFCFA(stats.total), icon: DollarSign, color: "text-green-600", to: "/admin/finances" },
    { label: "Commission générée", value: fmtFCFA(stats.commission), icon: BarChart2, color: "text-orange-600", to: "/admin/finances" },
    { label: "Réservations", value: nf.format(stats.reservations), icon: Users, color: "text-blue-600", to: "/admin/reservations" },
    { label: "Annulations", value: nf.format(stats.annulations), icon: TrendingDown, color: "text-red-600", to: "/admin/reservations" },
    { label: "Compagnies actives", value: nf.format(stats.compagnies), icon: Building2, color: "text-purple-600", to: "/admin/compagnies" },
    { label: "Nouvelles compagnies", value: nf.format(stats.nouvellesCompagnies), icon: TrendingUp, color: "text-emerald-600", to: "/admin/compagnies" },
  ]), [stats, navigate]);

  const handleExportCSV = () => {
    const rows: string[] = [];
    rows.push("=== KPIs ===");
    rows.push(`Total;${stats.total}`); rows.push(`Commission;${stats.commission}`);
    rows.push(`Réservations;${stats.reservations}`); rows.push(`Annulations;${stats.annulations}`);
    rows.push(`Compagnies;${stats.compagnies}`); rows.push("");
    rows.push("=== Séries ==="); rows.push("Date;GMV;Réservations");
    series.forEach(s => rows.push(`${s.date};${s.gmv};${s.reservations}`));
    rows.push(""); rows.push("=== Top compagnies ==="); rows.push("Compagnie;GMV;Réservations");
    topCompanies.forEach(c => rows.push(`${c.name};${c.gmv};${c.reservations}`));
    rows.push(""); rows.push("=== Top destinations ==="); rows.push("Trajet;GMV;Réservations");
    topDestinations.forEach(r => rows.push(`${r.route};${r.gmv};${r.reservations}`));
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "dashboard_export.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const handleExportXLSX = async () => {
    const XLSX = await import("xlsx");
    const kpiRows = [
      ["Période", (periode==="tout"?"Tout": periode==="7j"?"7 jours":"30 jours")],
      [], ["Indicateur","Valeur brute"],
      ["Total (GMV)", stats.total], ["Commission", stats.commission],
      ["Réservations", stats.reservations], ["Annulations", stats.annulations],
      ["Compagnies", stats.compagnies],
    ];
    const seriesRows = [["Date","GMV","Réservations"], ...series.map(s=>[s.date,s.gmv,s.reservations])];
    const topsCompRows = [["Compagnie","GMV","Réservations"], ...topCompanies.map(c=>[c.name,c.gmv,c.reservations])];
    const topsDestRows = [["Trajet","GMV","Réservations"], ...topDestinations.map(r=>[r.route,r.gmv,r.reservations])];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kpiRows), "KPIs");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(seriesRows), "Series");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(topsCompRows), "Top_Companies");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(topsDestRows), "Top_Destinations");
    XLSX.writeFile(wb, "dashboard_export.xlsx");
  };

  return (
    <div className="space-y-8">
      {/* Header local + filtres */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Vue d’ensemble</h2>
          <p className="text-gray-600">Performance globale de la plateforme.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          {/* Compagnie */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Compagnie :</label>
            <select
              className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-sm"
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
            >
              <option value="__all__">Toutes</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
          {/* Période */}
          <div className="flex gap-2">
            {(["7j","30j","tout"] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriode(p)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition ${
                  periode===p ? "bg-orange-600 text-white shadow"
                               : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`
                }
              >
                {p==="7j"?"7 jours": p==="30j"?"30 jours":"Tout"}
              </button>
            ))}
          </div>
          {/* Exports */}
          <div className="flex gap-2">
            <button onClick={handleExportCSV}
              className="flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700">
              <Download className="h-4 w-4" /> Export CSV
            </button>
            <button onClick={handleExportXLSX}
              className="flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700">
              <Download className="h-4 w-4" /> Export Excel
            </button>
          </div>
        </div>
      </div>

      {/* KPI cliquables */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map(({ label, value, icon: Icon, color, to }) => (
          <button
            key={label}
            onClick={() => navigate(to)}
            className="text-left bg-white p-4 rounded-xl border shadow-sm hover:shadow-md hover:translate-y-[-1px] transition focus:outline-none focus:ring-2 focus:ring-orange-200"
          >
            <Icon className={`h-6 w-6 mb-2 ${color}`} />
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-lg font-bold">{value}</p>
          </button>
        ))}
      </div>

      {/* Trends */}
      <section className="bg-white p-6 rounded-xl shadow-sm border">
        <h3 className="text-lg font-semibold mb-4">Tendances</h3>
        {series.length===0 ? (
          <p className="text-gray-500 text-sm">Pas assez de données temporelles.</p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="gmv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16a34a" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="bookings" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#64748b" }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="gmv" name="GMV (FCFA)" stroke="#16a34a" fill="url(#gmv)" />
                <Area type="monotone" dataKey="reservations" name="Réservations" stroke="#2563eb" fill="url(#bookings)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Top compagnies */}
      <section className="bg-white p-6 rounded-xl shadow-sm border">
        <h3 className="text-lg font-semibold mb-4">Top compagnies</h3>
        {topCompanies.length === 0 ? (
          <p className="text-gray-500 text-sm">Pas de données.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2">Compagnie</th>
                  <th className="px-4 py-2">Réservations</th>
                  <th className="px-4 py-2">GMV</th>
                </tr>
              </thead>
              <tbody>
                {topCompanies.map(c => (
                  <tr key={c.id} className="border-t">
                    <td className="px-4 py-2 font-medium">{c.name}</td>
                    <td className="px-4 py-2">{nf.format(c.reservations)}</td>
                    <td className="px-4 py-2">{fmtFCFA(c.gmv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Top destinations */}
      <section className="bg-white p-6 rounded-xl shadow-sm border">
        <h3 className="text-lg font-semibold mb-4">Top destinations</h3>
        {topDestinations.length === 0 ? (
          <p className="text-gray-500 text-sm">Pas de données.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2">Trajet</th>
                  <th className="px-4 py-2">Réservations</th>
                  <th className="px-4 py-2">GMV</th>
                </tr>
              </thead>
              <tbody>
                {topDestinations.map(r => (
                  <tr key={r.route} className="border-t">
                    <td className="px-4 py-2 font-medium">{r.route}</td>
                    <td className="px-4 py-2">{nf.format(r.reservations)}</td>
                    <td className="px-4 py-2">{fmtFCFA(r.gmv)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Alertes */}
      <section className="bg-white p-6 rounded-xl shadow-sm border">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-500" /> Alertes
        </h3>
        <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
          <li>Compagnies sans réservation depuis 30 jours</li>
          <li>Factures impayées détectées</li>
          <li>Taux d’annulation supérieur à 20%</li>
        </ul>
      </section>
    </div>
  );
};

export default AdminDashboard;
