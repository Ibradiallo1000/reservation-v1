// src/components/dashboardCompagnie/AgencyDetailsTable.tsx
import React from 'react';

interface AgencyDetailsTableProps {
  data: {
    id: string;
    nom: string;
    ville: string;
    reservations: number;
    revenus: number;
  }[];
}

const AgencyDetailsTable: React.FC<AgencyDetailsTableProps> = ({ data }) => {
  return (
    <div className="overflow-x-auto bg-white rounded-lg shadow">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Agence</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ville</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Réservations</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenus</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.map((agency) => (
            <tr key={agency.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{agency.nom}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{agency.ville}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">
                {agency.reservations.toLocaleString()}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">
                {agency.revenus.toLocaleString()} FCFA
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AgencyDetailsTable;
