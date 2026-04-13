import{r as o,p as q,o as M,q as K,w as _,v as U,a8 as ee,x as te,Y as W,W as ae,F as d,aa as l}from"./vendor-Ei8HehXc.js";import{e as ie,d as f}from"../index-CCf92_Bt.js";import{P as re,S as A,E as ne}from"./Input-CsQWQdkt.js";import{b as se}from"./types-DuSYHM9o.js";import{m as de}from"./tripExecutionService-_NoVUzw7.js";import"./typography-DRaXVLzj.js";import"./agencyCity-BG1SRcM5.js";import"./stopResolution-CWEeScOv.js";function i(t){return String(t??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function le(t){const c=String(t.boardingStatus??"").toLowerCase();if(c==="boarded")return"embarqué";if(c==="no_show")return"absent";const a=String(t.statutEmbarquement??"").toLowerCase();return a==="embarqué"||a==="embarque"?"embarqué":a==="absent"?"absent":"en attente"}function Y(t,c){const a=window.open("","_blank","noopener,noreferrer,width=980,height=900");if(!a)throw new Error("Impossible d'ouvrir la fenêtre d'impression.");a.document.open(),a.document.write(t),a.document.close(),a.document.title=c,a.focus(),a.print()}const ve=()=>{const{user:t,company:c}=ie(),a=(t==null?void 0:t.companyId)??null,m=(t==null?void 0:t.agencyId)??null,$=(t==null?void 0:t.uid)??null,P=Array.isArray(t==null?void 0:t.role)?t.role:t!=null&&t.role?[t.role]:[],I=P.includes("chefAgence")||P.includes("chefagence"),[E,S]=o.useState([]),[J,y]=o.useState(!0),[V,D]=o.useState(null),L=String((c==null?void 0:c.nom)??"Compagnie"),C=String((c==null?void 0:c.logoUrl)??""),j=String((t==null?void 0:t.agencyNom)??(t==null?void 0:t.agencyName)??m??""),H=o.useCallback(async e=>{const r=String(e.departure??e.departureCity??e.routeDeparture??"").trim(),u=String(e.arrival??e.arrivalCity??e.routeArrival??"").trim(),g=String(e.time??e.departureTime??"").trim(),n=String(e.date??"").trim(),s=String(e.vehicleId??"").trim(),h=String(e.weeklyTripId??"").trim();let x="—";if(s)try{const b=await q(M(f,`companies/${a}/fleetVehicles/${s}`));b.exists()?x=String(b.data().plateNumber??"").trim()||s:x=s}catch{x=s}let B="—",O="—";if(m&&h&&n&&g){const b=`${h}_${n}_${g}`;try{const v=await q(M(f,`companies/${a}/agences/${m}/tripAssignments/${b}`));if(v.exists()){const p=v.data();B=String(p.driverName??"").trim()||"—",O=String(p.convoyeurName??"").trim()||"—"}}catch{}}let N=0,k=0,F=0,G=0;if(m&&r&&u&&g&&n)try{const b=se(r,u,g,n),v=await q(M(f,`companies/${a}/agences/${m}/boardingStats/${b}`));if(v.exists()){const p=v.data();N=Number(p.embarkedSeats??0),k=Number(p.absentSeats??0),F=Number(p.totalSeats??p.expectedSeats??p.expectedCount??Math.max(0,N+k)),G=Number(p.reservationsCount??p.totalReservations??p.expectedCount??0)}}catch{}return{tripInstanceId:e.id,agencyId:String(e.agencyId??m??""),date:n,heure:g,departure:r,arrival:u,vehiclePlate:x,driverName:B,convoyeurName:O,reservationsCount:Math.max(0,G),totalSeats:Math.max(0,F),embarkedSeats:Math.max(0,N),absentSeats:Math.max(0,k),statutMetier:"validation_agence_requise"}},[m,a]);o.useEffect(()=>{if(!a||!m||!I){S([]),y(!1);return}y(!0);const e=K(U(f,`companies/${a}/tripInstances`),_("agencyId","==",m),_("statutMetier","==","validation_agence_requise")),r=ee(e,async u=>{const g=u.docs.map(s=>({id:s.id,...s.data()})),n=await Promise.all(g.map(s=>H(s)));n.sort((s,h)=>`${s.date} ${s.heure}`.localeCompare(`${h.date} ${h.heure}`)),S(n),y(!1)},()=>{S([]),y(!1)});return()=>r()},[m,a,I,H]);const R=o.useCallback(async e=>(await te(K(U(f,`companies/${a}/agences/${e.agencyId}/reservations`),_("tripInstanceId","==",e.tripInstanceId)))).docs.map(u=>({id:u.id,...u.data()})),[a]),Q=o.useCallback(async e=>{if(!(!a||!$)){if(e.statutMetier!=="validation_agence_requise"){alert("Validation impossible: statut métier incorrect.");return}D(e.tripInstanceId);try{await de(a,e.tripInstanceId,$),alert("Départ validé. Le trajet est maintenant en transit.")}catch(r){alert(r instanceof Error?r.message:"Erreur de validation du départ.")}finally{D(null)}}},[a,$]),z=o.useCallback((e,r)=>{const u=W(new Date,"EEEE d MMMM yyyy 'à' HH:mm",{locale:ae}),g=r.map((n,s)=>{const h=le(n);return`<tr>
            <td>${s+1}</td>
            <td>${i(n.nomClient||"—")}</td>
            <td>${i(n.telephone||"—")}</td>
            <td>${i(n.referenceCode||n.id||"—")}</td>
            <td style="text-align:center">${i(n.seatsGo??1)}</td>
            <td style="text-align:center">${i(h)}</td>
          </tr>`}).join("");return`<!doctype html><html><head><meta charset="utf-8" />
<title>Liste passagers - ${i(e.tripInstanceId)}</title>
<style>
body{font-family:Arial,sans-serif;color:#000;padding:14px}
.h{display:flex;gap:12px;align-items:center;margin-bottom:8px}
.logo{width:56px;height:56px;object-fit:contain;border:1px solid #000}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border:1px solid #000;padding:6px}
.meta{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:6px 10px;margin:8px 0}
.f{margin-top:10px;border-top:1px solid #000;padding-top:8px;font-size:11px}
.sig{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:12px}
.line{height:22mm;border-bottom:1px solid #000}
</style></head><body>
<div class="h">
  ${C?`<img class="logo" src="${i(C)}" />`:'<div class="logo"></div>'}
  <div>
    <div style="font-size:16px;font-weight:700">Liste passagers officielle</div>
    <div style="font-size:13px">${i(L)}</div>
  </div>
</div>
<div class="meta">
  <b>Agence</b><span>${i(j)}</span>
  <b>Date/heure</b><span>${i(`${e.date} ${e.heure}`)}</span>
  <b>Trajet</b><span>${i(`${e.departure} → ${e.arrival}`)}</span>
  <b>Identifiant trajet</b><span>${i(e.tripInstanceId)}</span>
</div>
<table><thead><tr><th>#</th><th>Nom</th><th>Téléphone</th><th>Référence</th><th>Places</th><th>Statut</th></tr></thead>
<tbody>${g||'<tr><td colspan="6" style="text-align:center">Aucun passager</td></tr>'}</tbody></table>
<div class="f">Totaux: R ${e.reservationsCount} / P ${e.totalSeats} / E ${e.embarkedSeats} / A ${e.absentSeats}</div>
<div class="sig">
  <div><div class="line"></div><div style="text-align:center;margin-top:4px">Chef embarquement</div></div>
  <div><div class="line"></div><div style="text-align:center;margin-top:4px">Chauffeur</div></div>
  <div><div class="line"></div><div style="text-align:center;margin-top:4px">Chef agence</div></div>
</div>
<div style="margin-top:10px;font-size:10px;color:#444">Édition du ${i(u)}</div>
</body></html>`},[j,C,L]),T=o.useCallback(e=>{const r=W(new Date,"yyyy-MM-dd HH:mm");return`<!doctype html><html><head><meta charset="utf-8" />
<title>Bon de route - ${i(e.tripInstanceId)}</title>
<style>
body{font-family:Arial,sans-serif;color:#000;padding:14px}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border:1px solid #000;padding:7px;text-align:left}
.sig{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:16px}
.line{height:22mm;border-bottom:1px solid #000}
</style></head><body>
<h2 style="margin:0 0 8px 0">Bon de route officiel</h2>
<table>
  <tr><th>Identifiant trajet</th><td>${i(e.tripInstanceId)}</td></tr>
  <tr><th>Trajet</th><td>${i(`${e.departure} → ${e.arrival}`)}</td></tr>
  <tr><th>Date / heure</th><td>${i(`${e.date} ${e.heure}`)}</td></tr>
  <tr><th>Véhicule (immatriculation)</th><td>${i(e.vehiclePlate)}</td></tr>
  <tr><th>Chauffeur</th><td>${i(e.driverName)}</td></tr>
  <tr><th>Convoyeur</th><td>${i(e.convoyeurName)}</td></tr>
  <tr><th>Heure départ validée</th><td>${i(r)}</td></tr>
  <tr><th>Nombre passagers (embarqués)</th><td>${i(e.embarkedSeats)}</td></tr>
</table>
<div class="sig">
  <div><div class="line"></div><div style="text-align:center;margin-top:4px">Chauffeur</div></div>
  <div><div class="line"></div><div style="text-align:center;margin-top:4px">Chef embarquement</div></div>
  <div><div class="line"></div><div style="text-align:center;margin-top:4px">Chef agence</div></div>
</div>
</body></html>`},[]),X=o.useCallback(async e=>{if(e.statutMetier!=="validation_agence_requise"){alert("Impression bloquée: statut métier incorrect.");return}try{const r=await R(e);Y(z(e,r),`Liste passagers - ${e.tripInstanceId}`)}catch(r){alert(r instanceof Error?r.message:"Erreur d'impression.")}},[z,R]),Z=o.useCallback(e=>{if(e.statutMetier!=="validation_agence_requise"){alert("Impression bloquée: statut métier incorrect.");return}Y(T(e),`Bon de route - ${e.tripInstanceId}`)},[T]),w=o.useMemo(()=>"Validation départs",[]);return I?l("div",{className:"space-y-4",children:[d(re,{title:w,subtitle:"Validation administrative finale des départs (lecture seule passagers)"}),J?d(A,{title:"Chargement",children:d("p",{className:"text-sm text-gray-600 dark:text-gray-300",children:"Chargement des départs à valider…"})}):E.length===0?d(A,{title:"Validation départs",children:d(ne,{message:"Aucun départ à valider"})}):d("div",{className:"grid gap-3",children:E.map(e=>l(A,{title:`${e.departure} → ${e.arrival} • ${e.heure}`,children:[l("div",{className:"grid grid-cols-1 md:grid-cols-2 gap-2 text-sm mb-3",children:[l("div",{children:[d("span",{className:"font-semibold",children:"Véhicule:"})," ",e.vehiclePlate]}),l("div",{children:[d("span",{className:"font-semibold",children:"Chauffeur:"})," ",e.driverName]}),l("div",{children:[d("span",{className:"font-semibold",children:"Convoyeur:"})," ",e.convoyeurName]}),l("div",{children:[d("span",{className:"font-semibold",children:"Statut métier:"})," ",e.statutMetier]})]}),l("div",{className:"flex flex-wrap items-center gap-2 mb-3 text-xs font-semibold",children:[l("span",{className:"px-2 py-1 rounded bg-blue-600 text-white",children:["R ",e.reservationsCount]}),l("span",{className:"px-2 py-1 rounded bg-indigo-600 text-white",children:["P ",e.totalSeats]}),l("span",{className:"px-2 py-1 rounded bg-emerald-600 text-white",children:["E ",e.embarkedSeats]}),l("span",{className:"px-2 py-1 rounded bg-red-600 text-white",children:["A ",e.absentSeats]})]}),l("div",{className:"flex flex-wrap gap-2",children:[d("button",{type:"button",className:"px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50",disabled:V===e.tripInstanceId||e.statutMetier!=="validation_agence_requise",onClick:()=>void Q(e),children:V===e.tripInstanceId?"Validation...":"Valider et autoriser départ"}),d("button",{type:"button",className:"px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm",onClick:()=>void X(e),disabled:e.statutMetier!=="validation_agence_requise",children:"Imprimer liste passagers"}),d("button",{type:"button",className:"px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm",onClick:()=>Z(e),disabled:e.statutMetier!=="validation_agence_requise",children:"Imprimer bon de route"})]})]},e.tripInstanceId))})]}):d("div",{className:"p-4 text-red-700 dark:text-red-300",children:"Accès refusé: cette page est réservée au chef d'agence."})};export{ve as default};
