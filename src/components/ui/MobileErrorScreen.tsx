import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface Props {
  error?: Error;
}

export default function MobileErrorScreen({ error }: Props) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
      <h2 className="text-2xl font-bold mb-4">Erreur Technique</h2>
      <p className="mb-6">{error?.message || "Une erreur est survenue"}</p>
      <div className="flex gap-4">
        <Button onClick={() => window.location.reload()}>
          Réessayer
        </Button>
        <Button variant="outline" onClick={() => navigate('/')}>
          Retour à l'accueil
        </Button>
      </div>
    </div>
  );
}