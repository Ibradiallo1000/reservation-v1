// src/modules/agence/courrier/pages/CourierDashboardPage.tsx
// Phase 1: Point d'entrée Courrier — redirection vers Session.

import React from "react";
import { Navigate } from "react-router-dom";

const CourierDashboardPage: React.FC = () => {
  return <Navigate to="/agence/courrier/session" replace />;
};

export default CourierDashboardPage;
