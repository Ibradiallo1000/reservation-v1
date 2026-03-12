import { Button } from '@/shared/ui/button';

interface Props {
  error?: Error;
}

export default function MobileErrorScreen({ error }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
      <h2 className="text-2xl font-bold mb-4">Erreur Technique</h2>
      <p className="mb-6">{error?.message || "Une erreur est survenue"}</p>
      <div className="flex gap-4">
        <Button onClick={() => window.location.reload()}>
          Réessayer
        </Button>
        <Button variant="secondary" onClick={() => { window.location.href = '/'; }}>
          Retour à l'accueil
        </Button>
      </div>
    </div>
  );
}