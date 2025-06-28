// ✅ src/components/dashboardCompagnie/GlobalStatsHeader.tsx

import React from 'react';
import DatePicker from 'react-datepicker';
import { fr } from 'date-fns/locale'; // ✅ Import correct
import 'react-datepicker/dist/react-datepicker.css';
import './GlobalStatsHeader.css'; // Ton style sci-fi
import { MiddlewareReturn } from '@floating-ui/core';
import { MiddlewareState } from '@floating-ui/dom';

interface GlobalStatsHeaderProps {
  dateRange: [Date, Date];
  setDateRange: (range: [Date, Date]) => void;
}

const GlobalStatsHeader: React.FC<GlobalStatsHeaderProps> = ({
  dateRange,
  setDateRange,
}) => {
  return (
    <div className="global-header sci-fi-header">
      <div className="header-left">
        <h1 className="header-title">Tableau de bord - Compagnie</h1>
        <p className="header-subtitle">
          Données du {dateRange[0].toLocaleDateString('fr-FR')} au {dateRange[1].toLocaleDateString('fr-FR')}
        </p>
      </div>
      <div className="header-right">
        <DatePicker
          selectsRange
          startDate={dateRange[0]}
          endDate={dateRange[1]}
          onChange={(update) => setDateRange(update as [Date, Date])}
          className="date-picker"
          dateFormat="dd/MM/yyyy"
          locale={fr}
          popperPlacement="bottom-end"
          popperModifiers={[
            {
              name: 'preventOverflow',
              options: {
                rootBoundary: 'viewport',
                tether: false,
              },
              fn: function (state: MiddlewareState): MiddlewareReturn | Promise<MiddlewareReturn> {
                throw new Error('Function not implemented.');
              }
            },
          ]}
          portalId="root-portal" // ✅ Force un portal pour éviter overflow hidden
        />
      </div>
    </div>
  );
};

export default GlobalStatsHeader;
