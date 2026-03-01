import React from 'react';
import { useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import { ActionButton } from '@/ui';
import { useFormatCurrency } from '@/shared/currency/CurrencyContext';
import { typography } from '@/ui/foundation';

// Interface pour les données de réservation
interface Reservation {
  id: string;
  nomClient: string;
  telephone: string;
  montant?: number;
  statut: string;
  seatsGo?: number;
}

// Interface pour l'état de localisation (props passées via navigation)
interface LocationState {
  reservations: Reservation[];
  date: string;
  heure: string;
  trajet: string;
  companyName?: string;
  logoUrl?: string;
  agencyName?: string;
}

const ReservationPrintPage: React.FC = () => {
  const location = useLocation();
  const state = location.state as LocationState;
  const money = useFormatCurrency();
  const today = format(new Date(), 'dd/MM/yyyy');

  return (
    <div className="bg-white text-black p-6 print:p-0 print:m-0">
      {/*
        Bouton d'impression - visible uniquement à l'écran
        Utilisation de media queries CSS pour le cacher lors de l'impression
      */}
      <div className="print:hidden flex justify-end mb-4">
        <ActionButton
          onClick={() => {
            window.print();
            setTimeout(() => window.history.back(), 500);
          }}
        >
          🖨️ Imprimer
        </ActionButton>
      </div>

      {/*
        Conteneur principal pour l'impression
        - Utilisation de styles spécifiques pour l'impression
        - Taille fixe pour un meilleur contrôle sur la sortie imprimée
      */}
      <div className="print:block print:w-full print:max-w-4xl print:mx-auto print:my-0 print:bg-white print:text-black">
        {/*
          En-tête de document
          - Centré avec les informations principales
          - Bordure inférieure pour séparation visuelle
        */}
        <header className="text-center border-b border-gray-300 pb-4 mb-6 print:pb-2 print:mb-4">
          {/* Logo de la compagnie si disponible */}
          {state.logoUrl && (
            <img
              src={state.logoUrl}
              alt="logo"
              className="h-16 mx-auto mb-2 print:h-14"
            />
          )}
          
          {/* Nom de la compagnie */}
          <h1 className={typography.pageTitle + " text-center print:text-lg"}>{state.companyName}</h1>
          
          {/* Informations secondaires (agence et date) */}
          <div className="text-xs text-gray-600 print:text-xs">
            {state.agencyName && <span>{state.agencyName} - </span>}
            <span>Imprimé le {today}</span>
          </div>
          
          {/* Titre principal avec informations du trajet */}
          <h2 className={typography.sectionTitle + " mt-2 print:mt-1 print:text-base"}>
            Liste des réservations pour le trajet :{' '}
            <span className="text-blue-600">{state.trajet}</span>
          </h2>
          
          {/* Date et heure de départ */}
          <p className="text-sm text-gray-700 print:text-xs">
            Départ le {state.date} à {state.heure}
          </p>
        </header>

        {/*
          Tableau des réservations
          - Pleine largeur avec bordures claires
          - Police plus petite pour l'impression
        */}
        <table className="w-full text-xs border border-gray-300 print:text-xs">
          <thead className="bg-gray-100 print:bg-gray-100">
            <tr>
              <th className="border px-2 py-1 w-8">#</th>
              <th className="border px-2 py-1 text-left">Nom du client</th>
              <th className="border px-2 py-1 text-left">Téléphone</th>
              <th className="border px-2 py-1 w-12">Places</th>
              <th className="border px-2 py-1 text-right">Montant</th>
              <th className="border px-2 py-1 text-center">Statut</th>
            </tr>
          </thead>
          <tbody>
            {state.reservations.map((res, index) => (
              <tr key={res.id} className="break-inside-avoid">
                <td className="border px-2 py-1 text-center">{index + 1}</td>
                <td className="border px-2 py-1">{res.nomClient}</td>
                <td className="border px-2 py-1">{res.telephone}</td>
                <td className="border px-2 py-1 text-center">{res.seatsGo || 1}</td>
                <td className="border px-2 py-1 text-right">
                  {money(res.montant)}
                </td>
                <td className="border px-2 py-1 text-center">
                  <span className={`inline-block px-1 rounded ${
                    res.statut === 'Confirmé' ? 'bg-green-100 text-green-800' :
                    res.statut === 'En attente' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {res.statut}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/*
          Section de totaux (optionnelle)
          - Vous pourriez ajouter des totaux ici si nécessaire
        */}
        <div className="mt-2 text-right text-xs">
          Total réservations: {state.reservations.length} | 
          Places totales: {state.reservations.reduce((sum, res) => sum + (res.seatsGo || 1), 0)} | 
          Montant total: {money(state.reservations.reduce((sum, res) => sum + (res.montant || 0), 0))}
        </div>

        {/*
          Zone de signature
          - Positionnée à droite avec une ligne de signature
        */}
        <div className="mt-6 text-right text-xs italic text-gray-700 print:mt-4">
          <div className="border-t border-dashed border-gray-400 w-32 mb-1 ml-auto"></div>
          Signature du responsable
        </div>

        {/*
          Pied de page pour l'impression
          - Peut contenir des informations supplémentaires
        */}
        <footer className="mt-8 text-center text-xs text-gray-500 print:mt-4">
          <p>Document imprimé le {today} - {state.companyName}</p>
          <p className="mt-1">Merci pour votre confiance</p>
        </footer>
      </div>
    </div>
  );
};

export default ReservationPrintPage;