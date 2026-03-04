import React, { useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import ReservationStepHeader from '../components/ReservationStepHeader';
import USSDPaymentInstructions from '../components/USSDPaymentInstructions';

const formatCity = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);

export default function USSDPaymentInstructionsPage() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const state = (location.state || {}) as {
    ussdCode?: string;
    reservationId?: string;
    slug?: string;
    draft?: unknown;
    companyInfo?: { logoUrl?: string; couleurPrimaire?: string; couleurSecondaire?: string };
    paymentMethodKey?: string;
    depart?: string;
    arrivee?: string;
  };

  const ussdCode = state.ussdCode;
  const reservationId = state.reservationId;
  const companySlug = state.slug || slug;
  const primaryColor = state.companyInfo?.couleurPrimaire ?? '#2563eb';
  const secondaryColor = state.companyInfo?.couleurSecondaire ?? '#93c5fd';
  const subtitle = state.depart && state.arrivee
    ? `${formatCity(state.depart)} → ${formatCity(state.arrivee)}`
    : undefined;

  useEffect(() => {
    if (!ussdCode || !reservationId || !companySlug) {
      navigate(`/${companySlug || slug || ''}/booking`, { replace: true });
    }
  }, [ussdCode, reservationId, companySlug, slug, navigate]);

  const handleSendProof = () => {
    navigate(`/${companySlug}/upload-preuve/${reservationId}`, {
      replace: true,
      state: {
        draft: state.draft,
        companyInfo: state.companyInfo,
        paymentMethodKey: state.paymentMethodKey,
      },
    });
  };

  const handleRecompose = () => {
    if (ussdCode) {
      window.location.href = `tel:${encodeURIComponent(ussdCode)}`;
    }
  };

  if (!ussdCode || !reservationId || !companySlug) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 text-sm">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ReservationStepHeader
        onBack={() => navigate(-1)}
        primaryColor={primaryColor}
        secondaryColor={secondaryColor}
        title="Paiement USSD"
        subtitle={subtitle}
        logoUrl={state.companyInfo?.logoUrl}
      />
      <USSDPaymentInstructions
        ussdCode={ussdCode}
        primaryColor={primaryColor}
        secondaryColor={secondaryColor}
        onSendProof={handleSendProof}
        onRecompose={handleRecompose}
      />
    </div>
  );
}
