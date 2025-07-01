import React from 'react';

interface StatCardProps {
  title: string;
  value: number;
  icon?: React.ReactNode; // Icone custom
  isCurrency?: boolean;
  trend?: string;
  trendType?: 'positive' | 'negative';
  content?: React.ReactNode;
  themeColor?: string;
  className?: string;
  onClick?: () => void; // ✅ Cliquable
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  isCurrency = false,
  trend,
  trendType,
  content,
  themeColor,
  className = '',
  onClick, // ✅ Prend le click
}) => {
  const formattedValue = isCurrency
    ? `${value.toLocaleString('fr-FR')} FCFA`
    : value.toLocaleString('fr-FR');

  return (
    <div
      onClick={onClick} // ✅ Ajoute le onClick ici !
      className={`cursor-pointer rounded-xl p-6 shadow-sm border border-gray-100 transition-all duration-300 hover:shadow-md ${className}`}
      style={themeColor ? { borderTop: `4px solid ${themeColor}` } : {}}
    >
      <div className="flex justify-between items-start">
        <div>
          <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
            {title}
          </h4>

          {content ? (
            <div className="mt-2">{content}</div>
          ) : (
            <div className="mt-2 flex items-baseline">
              <p className="text-2xl font-semibold text-gray-900">
                {formattedValue}
              </p>
              {trend && (
                <span
                  className={`ml-2 text-sm font-medium ${
                    trendType === 'positive' ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {trend}
                </span>
              )}
            </div>
          )}
        </div>

        {icon && (
          <div
            className="p-3 rounded-lg bg-opacity-10"
            style={{ backgroundColor: themeColor }}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
};

export default StatCard;
