import React, { useState } from "react";
import { ActionButton, AppCard, Dialog, EmptyState, IconButton, Input, PageHeader, Spinner, StatusBadge, TableShell } from "@/ui";
import { Skeleton } from "@/shared/ui/skeleton";

export default function UiFoundationsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  return <main className="min-h-screen bg-[var(--color-surface-secondary)] p-[var(--space-page-x)] text-[var(--color-text)]">
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader title="Fondations UI Teliya" subtitle="Page locale sans donnée métier ni listener Firebase." />

      <section aria-labelledby="colors"><h2 id="colors" className="mb-3 text-lg font-semibold">Couleurs et statuts</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {["primary", "success", "warning", "danger", "info", "surface", "text", "border"].map((token) => <div key={token} className="rounded-xl border border-[var(--color-border)] bg-white p-3"><div className="mb-2 h-12 rounded-lg border" style={{ background: `var(--color-${token})` }} /><code className="text-xs">{token}</code></div>)}
        </div>
        <div className="mt-3 flex flex-wrap gap-2"><StatusBadge status="success">Succès</StatusBadge><StatusBadge status="warning">Attention</StatusBadge><StatusBadge status="danger">Erreur</StatusBadge><StatusBadge status="info">Information</StatusBadge><StatusBadge status="neutral">Neutre</StatusBadge></div>
      </section>

      <AppCard><h2 className="mb-4 text-lg font-semibold">Boutons et champs</h2><div className="flex flex-wrap gap-2">
        <ActionButton>Primaire</ActionButton><ActionButton variant="secondary">Secondaire</ActionButton><ActionButton variant="outline">Contour</ActionButton><ActionButton variant="ghost">Discret</ActionButton><ActionButton variant="danger">Danger</ActionButton><ActionButton loading>Chargement</ActionButton><IconButton aria-label="Ajouter un élément">+</IconButton>
      </div><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">Libellé<Input className="mt-1" placeholder="Saisir une valeur" /></label><label className="text-sm font-medium">Désactivé<Input className="mt-1" disabled value="Indisponible" readOnly /></label></div></AppCard>

      <div className="grid gap-4 md:grid-cols-2"><AppCard><h2 className="mb-3 text-lg font-semibold">Chargement</h2><Spinner /><div className="mt-4 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></div></AppCard><AppCard><h2 className="mb-3 text-lg font-semibold">État vide</h2><EmptyState message="Aucun élément de démonstration." /></AppCard></div>

      <section><h2 className="mb-3 text-lg font-semibold">Tableau responsive</h2><TableShell label="Démonstration des statuts"><table className="min-w-[42rem] w-full text-sm"><thead><tr className="bg-slate-50 text-left"><th className="p-3">Référence</th><th className="p-3">Statut</th><th className="p-3">Description</th></tr></thead><tbody><tr className="border-t"><td className="p-3">UI-001</td><td className="p-3"><StatusBadge status="active">Actif</StatusBadge></td><td className="p-3">Le défilement reste local au tableau.</td></tr></tbody></table></TableShell></section>

      <section><h2 className="mb-3 text-lg font-semibold">Dialog accessible</h2><ActionButton onClick={() => setDialogOpen(true)}>Ouvrir le dialog</ActionButton></section>
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Dialog de démonstration" description="Escape, focus trap et restauration du focus sont gérés par Headless UI." footer={<ActionButton onClick={() => setDialogOpen(false)}>Confirmer</ActionButton>}><p>Le contenu défile dans le dialog sans créer d’overflow global.</p></Dialog>
    </div>
  </main>;
}
