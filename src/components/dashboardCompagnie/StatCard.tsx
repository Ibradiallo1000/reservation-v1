// src/components/dashboardCompagnie/StatCard.tsx
import React from 'react';
import './StatCard.css'; // ⚡ Ton style à créer à côté

interface StatCardProps {
  title: string;
  value: number;
  icon?: string;
  trend?: string;
  isCurrency?: boolean;
  theme?: 'neon-blue' | 'neon-purple' | 'neon-green' | 'neon-orange';
  glow?: boolean;
  pulse?: boolean;
  shimmer?: boolean;
  animatedBorder?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  trend,
  isCurrency,
  theme = 'neon-blue',
  glow,
  pulse,
  shimmer,
  animatedBorder,
}) => {
  return (
    <div
      className={`
        stat-card 
        ${theme} 
        ${glow ? 'glow' : ''} 
        ${pulse ? 'pulse' : ''} 
        ${shimmer ? 'shimmer' : ''} 
        ${animatedBorder ? 'animated-border' : ''}
      `}
    >
      <div className="stat-card-icon">{icon}</div>
      <div className="stat-card-content">
        <h4 className="stat-card-title">{title}</h4>
        <div className="stat-card-value">
          {isCurrency ? `${value.toLocaleString()} FCFA` : value.toLocaleString()}
          {trend && (
            <span
              className={`stat-card-trend ${
                trend.startsWith('+') ? 'trend-up' : 'trend-down'
              }`}
            >
              {trend}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default StatCard;
