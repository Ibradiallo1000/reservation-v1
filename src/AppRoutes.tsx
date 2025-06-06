// src/AppRoutes.tsx
import React, { Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import PageLoader from './components/PageLoaderComponent';
import HomePage from './pages/HomePage';

const AppRoutes: React.FC = () => {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        {/* ➕ Ajoute ici les autres routes si nécessaire */}
      </Routes>
    </Suspense>
  );
};

export default AppRoutes;
