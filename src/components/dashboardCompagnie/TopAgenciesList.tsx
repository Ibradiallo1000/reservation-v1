// src/components/dashboardCompagnie/TopAgenciesList.tsx
import React from 'react';
import './TopAgenciesList.css'; // 💥 Ton style sci-fi

interface TopAgency {
  id: string;
  nom: string;
  ville: string;
  reservations: number;
  revenus: number;
}

interface TopAgenciesListProps {
  agencies: TopAgency[];
}

const TopAgenciesList: React.FC<TopAgenciesListProps> = ({ agencies }) => {
  return (
    <div className="top-agencies-card">
      <h3 className="top-agencies-title">Top Agences Performantes</h3>
      <ul className="top-agencies-list">
        {agencies.map((agency, index) => (
          <li key={agency.id} className="agency-item">
            <span className="rank">#{index + 1}</span>
            <div className="agency-info">
              <p className="agency-name">{agency.nom}</p>
              <p className="agency-ville">{agency.ville}</p>
            </div>
            <div className="agency-performance">
              <span className="reservations">{agency.reservations} réservations</span>
              <span className="revenus">{agency.revenus.toLocaleString()} FCFA</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TopAgenciesList;
