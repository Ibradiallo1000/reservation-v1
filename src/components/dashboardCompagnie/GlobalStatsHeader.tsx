import React from 'react';
import DatePicker from 'react-datepicker';
import { fr } from 'date-fns/locale';
import 'react-datepicker/dist/react-datepicker.css';

interface CompanyColors {
  primary: string;
  secondary: string;
  accent: string;
  tertiary: string;
  text: string;
  background: string;
}

interface GlobalStatsHeaderProps {
  dateRange: [Date, Date];
  setDateRange: (range: [Date, Date]) => void;
  colors: CompanyColors;
  className?: string;
  companyName?: string;
}

const GlobalStatsHeader: React.FC<GlobalStatsHeaderProps> = ({ 
  dateRange, 
  setDateRange, 
  colors,
  className = '',
  companyName
}) => {
  const handleDateChange = (update: [Date | null, Date | null]) => {
    if (update[0] && update[1]) {
      setDateRange([update[0], update[1]]);
    }
  };

  return (
    <div 
      className={`flex flex-col md:flex-row justify-between items-center rounded-lg shadow-sm p-6 transition-colors duration-200 ${className}`}
      style={{ 
        backgroundColor: colors.background,
        borderBottom: `4px solid ${colors.primary}`
      }}
    >
      <div className="flex-1">
        <h1 
          className="text-2xl font-bold mb-1 flex items-center gap-2"
          style={{ color: '#111' }} // ✅ Couleur forcée sombre pour garantir la lisibilité
        >
          {companyName && (
            <span className="text-sm font-normal bg-gray-100 px-2 py-1 rounded-md" style={{ color: colors.primary }}>
              {companyName}
            </span>
          )}
          Tableau de bord
        </h1>
        <p className="text-sm text-gray-600">
          Période du {dateRange[0].toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} au {dateRange[1].toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>
      
      <div className="mt-4 md:mt-0">
        <DatePicker
          selectsRange
          startDate={dateRange[0]}
          endDate={dateRange[1]}
          onChange={handleDateChange}
          locale={fr}
          dateFormat="dd/MM/yyyy"
          className="border border-gray-300 p-2 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
          wrapperClassName="date-picker"
          isClearable
          withPortal
          selectsDisabledDaysInRange
          disabledKeyboardNavigation
          dropdownMode="select"
        />
      </div>
    </div>
  );
};

export default GlobalStatsHeader;
