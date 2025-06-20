import React, { useEffect } from 'react';
import { generateDailyTrips } from '../services/generateDailyTrips';

const AutoGeneratePage: React.FC = () => {
  useEffect(() => {
    const run = async () => {
      await generateDailyTrips();
      console.log('🚀 DailyTrips générés automatiquement');
    };
    run();
  }, []);

  return <div>DailyTrips générés automatiquement.</div>;
};

export default AutoGeneratePage;
