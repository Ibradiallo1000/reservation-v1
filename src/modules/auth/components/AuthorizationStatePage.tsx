import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Building2, MapPin, ShieldX, ToggleLeft, UserX } from "lucide-react";

export type AuthorizationState =
  | "access_denied"
  | "unknown_role"
  | "missing_company"
  | "missing_agency"
  | "feature_unavailable";

const CONTENT: Record<AuthorizationState, { title: string; message: string; icon: typeof ShieldX }> = {
  access_denied: { title: "Accès non autorisé", message: "Votre profil ne permet pas d’ouvrir cet espace.", icon: ShieldX },
  unknown_role: { title: "Rôle non reconnu", message: "Votre profil doit être vérifié par un administrateur avant de continuer.", icon: UserX },
  missing_company: { title: "Compagnie manquante", message: "Aucune compagnie n’est associée à votre profil.", icon: Building2 },
  missing_agency: { title: "Agence manquante", message: "Aucune agence n’est associée à votre profil.", icon: MapPin },
  feature_unavailable: { title: "Fonction indisponible", message: "Ce module n’est pas actif dans la version actuelle de Teliya.", icon: ToggleLeft },
};

export default function AuthorizationStatePage({ state }: { state: AuthorizationState }) {
  const content = CONTENT[state];
  const Icon = content.icon ?? AlertTriangle;
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6" aria-labelledby="authorization-title">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm" role="alert">
        <Icon className="mx-auto h-10 w-10 text-orange-600" aria-hidden />
        <h1 id="authorization-title" className="mt-4 text-xl font-bold text-slate-900">{content.title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{content.message}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/role-landing" className="min-h-11 rounded-xl bg-orange-600 px-4 py-3 text-sm font-semibold text-white">Retour à mon espace</Link>
          <Link to="/login" className="min-h-11 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700">Connexion</Link>
        </div>
      </section>
    </main>
  );
}
