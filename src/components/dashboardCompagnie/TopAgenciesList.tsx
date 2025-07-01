// ✅ src/components/dashboardCompagnie/TopAgenciesList.tsx
import React from 'react';

interface AgencyStats {
  id: string;
  nom: string;
  ville: string;
  reservations: number;
  revenus: number;
}

interface Props {
  agencies: AgencyStats[];
}

const TopAgenciesList: React.FC<Props> = ({ agencies }) => {
  const sorted = [...agencies].sort((a, b) => b.revenus - a.revenus).slice(0, 5);

  return (
    <div className="bg-white rounded shadow p-4">
      <h3 className="font-semibold mb-2">Top agences</h3>
      <ul>
        {sorted.map((a, i) => (
          <li key={a.id} className="py-2 border-b last:border-b-0">
            <div className="flex justify-between">
              <span>{i + 1}. {a.nom} ({a.ville})</span>
              <span>{a.revenus.toLocaleString()} FCFA</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TopAgenciesList;
