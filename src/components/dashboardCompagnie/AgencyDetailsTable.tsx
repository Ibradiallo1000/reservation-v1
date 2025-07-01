import React from 'react';
import { ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/20/solid';

interface AgencyStats {
  id: string;
  nom: string;
  ville: string;
  reservations: number;
  revenus: number;
  trend?: number; // Pourcentage d'évolution
}

interface Props {
  data: AgencyStats[];
  className?: string;
  showActions?: boolean;
  onRowClick?: (agencyId: string) => void;
}

const AgencyDetailsTable: React.FC<Props> = ({ 
  data, 
  className = '',
  showActions = false,
  onRowClick 
}) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'XOF',
      maximumFractionDigits: 0
    }).format(value);
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${className}`}>
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Détails des agences</h3>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Agence
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Ville
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Réservations
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Revenus
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Évolution
              </th>
              {showActions && (
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.map((agency) => (
              <tr 
                key={agency.id} 
                className={`hover:bg-gray-50 ${onRowClick ? 'cursor-pointer' : ''}`}
                onClick={() => onRowClick && onRowClick(agency.id)}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{agency.nom}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-500">{agency.ville}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  {agency.reservations.toLocaleString('fr-FR')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  {formatCurrency(agency.revenus)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                  {agency.trend !== undefined && (
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      agency.trend >= 0 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {agency.trend >= 0 ? (
                        <ArrowUpIcon className="-ml-0.5 mr-1 h-3 w-3 text-green-500" />
                      ) : (
                        <ArrowDownIcon className="-ml-0.5 mr-1 h-3 w-3 text-red-500" />
                      )}
                      {Math.abs(agency.trend)}%
                    </span>
                  )}
                </td>
                {showActions && (
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button className="text-blue-600 hover:text-blue-900 mr-3">
                      Voir
                    </button>
                    <button className="text-indigo-600 hover:text-indigo-900">
                      Éditer
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pied de tableau optionnel */}
      {data.length > 0 && (
        <div className="bg-gray-50 px-6 py-3 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Affichage de <span className="font-medium">1</span> à <span className="font-medium">{data.length}</span> agences
            </div>
            <div className="flex space-x-2">
              <button className="px-3 py-1 border rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                Précédent
              </button>
              <button className="px-3 py-1 border rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                Suivant
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgencyDetailsTable;