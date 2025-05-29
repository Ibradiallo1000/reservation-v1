import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
const ReservationConfirmationPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { slug = 'compagnie' } = location.state; // fallback au cas où
    const [redirecting, setRedirecting] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => {
            setRedirecting(true);
            setTimeout(() => {
                navigate(`/compagnie/${slug}/receipt/${id}`);
            }, 3000); // Redirection après 3s d'affichage
        }, 3000); // Simulation de traitement initial
        return () => clearTimeout(timer);
    }, [id, navigate, slug]);
    return (_jsx("div", { className: "min-h-screen flex flex-col items-center justify-center bg-white text-gray-800 px-4", children: !redirecting ? (_jsxs("div", { className: "text-center", children: [_jsx("div", { className: "w-16 h-16 border-4 border-yellow-400 border-dashed rounded-full animate-spin mx-auto mb-6" }), _jsx("h1", { className: "text-xl font-semibold mb-2", children: "Paiement en cours..." }), _jsx("p", { className: "text-gray-600 mb-4", children: "Veuillez patienter pendant le traitement de votre r\u00E9servation." })] })) : (_jsxs("div", { className: "text-center", children: [_jsx("div", { className: "text-4xl text-green-500 mb-4", children: "\u2705" }), _jsx("h1", { className: "text-xl font-bold text-green-600 mb-2", children: "Paiement r\u00E9ussi !" }), _jsx("p", { className: "text-gray-700 mb-4", children: "Merci pour votre r\u00E9servation. Votre re\u00E7u est pr\u00EAt." }), _jsx("button", { onClick: () => navigate(`/compagnie/${slug}/receipt/${id}`), className: "bg-blue-600 text-white px-5 py-2 rounded hover:bg-blue-700 transition", children: "Voir mon re\u00E7u" }), _jsx("p", { className: "text-xs text-gray-400 mt-4", children: "Redirection automatique dans quelques secondes..." })] })) }));
};
export default ReservationConfirmationPage;
