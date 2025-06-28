// src/components/dashboardCompagnie/KpiCard.tsx
import React from 'react';
import './KpiCard.css'; // 💥 Ton style neon/sci-fi

interface KpiCardProps {
  title: string;
  value: number;
  icon?: string; // Emoji ou icône inline
  unit?: string; // Ex: "FCFA", "Billets"
  trend?: number; // Pourcentage d'évolution
  theme?: 'neon-blue' | 'neon-purple' | 'neon-green' | 'neon-orange'; // Thème visuel
}

const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  icon,
  unit,
  trend,
  theme = 'neon-blue',
}) => {
  return (
    <div className={`kpi-card ${theme}`}>
      {/* Icône ou emoji */}
      <div className="kpi-icon">{icon}</div>

      {/* Valeur principale */}
      <div className="kpi-value">
        {value.toLocaleString()} {unit && <span>{unit}</span>}
      </div>

      {/* Titre */}
      <div className="kpi-title">{title}</div>

      {/* Tendance */}
      {trend !== undefined && (
        <div className={`kpi-trend ${trend >= 0 ? 'up' : 'down'}`}>
          {trend >= 0 ? '+' : ''}
          {trend}%
        </div>
      )}
    </div>
  );
};

export default KpiCard;
