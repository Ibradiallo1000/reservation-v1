var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import QRCode from 'react-qr-code';
import html2pdf from 'html2pdf.js';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
const ReceiptEnLignePage = () => {
    var _a, _b;
    const { id, slug } = useParams();
    const navigate = useNavigate();
    const [reservation, setReservation] = useState(null);
    const [compagnie, setCompagnie] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const receiptRef = useRef(null);
    const formatDate = (dateInput, formatStr) => {
        try {
            let date;
            if (typeof dateInput === 'string') {
                date = parseISO(dateInput);
            }
            else if (dateInput instanceof Date) {
                date = dateInput;
            }
            else {
                date = new Date(dateInput.seconds * 1000);
            }
            return format(date, formatStr, { locale: fr });
        }
        catch (_a) {
            return 'Date invalide';
        }
    };
    const generateReceiptNumber = () => {
        if (!reservation)
            return 'ONL-000000';
        const date = reservation.createdAt instanceof Date ?
            reservation.createdAt :
            new Date(reservation.createdAt.seconds * 1000);
        const year = date.getFullYear();
        const num = reservation.id.slice(0, 6).toUpperCase();
        return `ONL-${year}-${num}`;
    };
    useEffect(() => {
        const fetchData = () => __awaiter(void 0, void 0, void 0, function* () {
            if (!id || !slug) {
                setError("Paramètres manquants dans l'URL");
                setLoading(false);
                return;
            }
            try {
                setLoading(true);
                const ref = doc(db, 'reservations', id);
                const snap = yield getDoc(ref);
                if (!snap.exists()) {
                    setError("Réservation introuvable");
                    setLoading(false);
                    return;
                }
                const data = snap.data();
                if (!data.companySlug || data.companySlug !== slug) {
                    setError("URL invalide pour cette réservation");
                    setLoading(false);
                    return;
                }
                const reservationData = Object.assign(Object.assign({}, data), { id: snap.id, createdAt: data.createdAt instanceof Date ?
                        data.createdAt :
                        new Date(data.createdAt.seconds * 1000) });
                // Charger les infos de l'agence si elle existe
                let agenceNom = '';
                if (data.agencyId) {
                    const agencySnap = yield getDoc(doc(db, 'agences', data.agencyId));
                    if (agencySnap.exists()) {
                        agenceNom = agencySnap.data().nom || '';
                    }
                }
                setReservation(reservationData);
                setCompagnie({
                    nom: data.compagnieNom,
                    logoUrl: data.compagnieLogo,
                    couleurPrimaire: data.compagnieCouleur || '#3b82f6',
                    slug: data.companySlug,
                    agenceNom: agenceNom
                });
            }
            catch (err) {
                console.error("Erreur lors du chargement :", err);
                setError(err instanceof Error ? err.message : "Une erreur s'est produite");
            }
            finally {
                setLoading(false);
            }
        });
        fetchData();
    }, [id, slug]);
    const handlePDF = () => {
        if (receiptRef.current) {
            const opt = {
                margin: 5,
                filename: `recu-${generateReceiptNumber()}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    allowTaint: true,
                    scrollX: 0,
                    scrollY: 0
                },
                jsPDF: { unit: 'mm', format: 'a5', orientation: 'portrait' }
            };
            html2pdf()
                .set(opt)
                .from(receiptRef.current)
                .save();
        }
    };
    if (loading) {
        return (_jsx("div", { className: "flex items-center justify-center min-h-screen bg-gray-50", children: _jsxs("div", { className: "text-center", children: [_jsx("div", { className: "w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" }), _jsx("p", { className: "mt-4 text-gray-600", children: "Chargement du re\u00E7u..." })] }) }));
    }
    if (error || !reservation || !compagnie) {
        return (_jsx("div", { className: "flex items-center justify-center min-h-screen bg-gray-50", children: _jsxs("div", { className: "text-center p-6 max-w-md bg-white rounded-lg shadow-md", children: [_jsx("div", { className: "text-red-500 mb-4", children: _jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-12 w-12 mx-auto", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }) }) }), _jsx("h2", { className: "text-xl font-bold text-gray-800 mb-2", children: "Erreur" }), _jsx("p", { className: "text-gray-600 mb-6", children: error || 'Données introuvables' }), _jsx("button", { onClick: () => navigate('/'), className: "px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors", children: "Retour \u00E0 l'accueil" })] }) }));
    }
    const qrContent = JSON.stringify({
        receiptNumber: generateReceiptNumber(),
        compagnie: compagnie.nom,
        nom: reservation.nomClient,
        tel: reservation.telephone,
        date: reservation.date,
        heure: reservation.heure,
        depart: reservation.depart,
        arrivee: reservation.arrivee,
        places: `${reservation.seatsGo} aller${reservation.seatsReturn ? ` + ${reservation.seatsReturn} retour` : ''}`,
        montant: `${(_a = reservation.montant) === null || _a === void 0 ? void 0 : _a.toLocaleString('fr-FR')} FCFA`,
        statut: reservation.statut,
        paiement: reservation.paiement,
        canal: reservation.canal
    });
    return (_jsxs("div", { className: "bg-gray-50 min-h-screen py-4 px-2 sm:px-4 print:bg-white print:py-0", children: [_jsxs("div", { ref: receiptRef, className: "max-w-md mx-auto bg-white rounded-lg shadow-sm overflow-hidden print:shadow-none print:border-none print:rounded-none", style: { borderTop: `6px solid ${compagnie.couleurPrimaire}` }, children: [_jsx("div", { className: "p-4", style: { backgroundColor: compagnie.couleurPrimaire }, children: _jsxs("div", { className: "flex justify-between items-start", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-xl font-bold text-white truncate", children: compagnie.nom }), compagnie.agenceNom && (_jsxs("p", { className: "text-xs text-white opacity-80 mt-1 italic", children: ["Agence : ", compagnie.agenceNom] })), _jsxs("p", { className: "text-xs text-white opacity-80 mt-1", children: ["Re\u00E7u en ligne \u2022 ", generateReceiptNumber()] })] }), _jsx("img", { src: compagnie.logoUrl, alt: compagnie.nom, className: "h-12 object-contain bg-white p-1 rounded", onError: (e) => {
                                        const target = e.target;
                                        target.src = '/default-company.png';
                                    } })] }) }), _jsxs("div", { className: "p-4", children: [_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "bg-gray-50 p-3 rounded-lg border border-gray-200", children: [_jsx("h2", { className: "font-semibold text-base mb-2", style: { color: compagnie.couleurPrimaire }, children: "Informations client" }), _jsxs("div", { className: "space-y-2 text-sm", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-gray-600", children: "Nom :" }), _jsx("span", { className: "text-gray-800 font-medium", children: reservation.nomClient })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-gray-600", children: "T\u00E9l\u00E9phone :" }), _jsx("span", { className: "text-gray-800", children: reservation.telephone })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-gray-600", children: "Canal :" }), _jsx("span", { className: "text-gray-800 capitalize", children: reservation.canal })] })] })] }), _jsxs("div", { className: "bg-gray-50 p-3 rounded-lg border border-gray-200", children: [_jsx("h2", { className: "font-semibold text-base mb-2", style: { color: compagnie.couleurPrimaire }, children: "D\u00E9tails du voyage" }), _jsxs("div", { className: "space-y-2 text-sm", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-gray-600", children: "Trajet :" }), _jsxs("span", { className: "text-gray-800 text-right", children: [reservation.depart, " \u2192 ", reservation.arrivee] })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-gray-600", children: "Date :" }), _jsx("span", { className: "text-gray-800", children: formatDate(reservation.date, 'dd MMM yyyy') })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-gray-600", children: "Heure :" }), _jsx("span", { className: "text-gray-800", children: reservation.heure })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-gray-600", children: "Places :" }), _jsxs("span", { className: "text-gray-800", children: [reservation.seatsGo, " aller", reservation.seatsReturn ? ` + ${reservation.seatsReturn} retour` : ''] })] })] })] }), _jsxs("div", { className: "bg-gray-50 p-3 rounded-lg border border-gray-200", children: [_jsx("h2", { className: "font-semibold text-base mb-2", style: { color: compagnie.couleurPrimaire }, children: "Paiement" }), _jsxs("div", { className: "space-y-2 text-sm", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-gray-600", children: "Montant :" }), _jsxs("span", { className: "text-gray-800 font-bold", children: [(_b = reservation.montant) === null || _b === void 0 ? void 0 : _b.toLocaleString('fr-FR'), " FCFA"] })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-gray-600", children: "M\u00E9thode :" }), _jsx("span", { className: "text-gray-800 capitalize", children: reservation.paiement })] }), _jsxs("div", { className: "flex justify-between items-center", children: [_jsx("span", { className: "text-gray-600", children: "Statut :" }), _jsx("span", { className: `px-2 py-1 rounded text-xs ${reservation.statut === 'confirmé'
                                                                    ? 'bg-green-100 text-green-800'
                                                                    : reservation.statut === 'annulé'
                                                                        ? 'bg-red-100 text-red-800'
                                                                        : 'bg-yellow-100 text-yellow-800'}`, children: reservation.statut })] })] })] }), _jsxs("div", { className: "bg-gray-50 p-4 rounded-lg border border-gray-200 flex flex-col items-center", children: [_jsx("h2", { className: "font-semibold text-base mb-2", style: { color: compagnie.couleurPrimaire }, children: "Code d'embarquement" }), _jsx("div", { className: "bg-white p-2 rounded border", style: { borderColor: compagnie.couleurPrimaire }, children: _jsx(QRCode, { value: qrContent, size: 120, fgColor: compagnie.couleurPrimaire }) }), _jsx("p", { className: "text-xs text-gray-500 mt-2 text-center", children: "Pr\u00E9sentez ce code au chauffeur" })] })] }), _jsxs("div", { className: "mt-4 text-center text-xs text-gray-500", children: [_jsxs("p", { children: ["\u00C9mis le ", formatDate(reservation.createdAt, 'dd/MM/yyyy à HH:mm')] }), _jsx("p", { className: "mt-1", children: "Ce re\u00E7u est valable uniquement pour le trajet indiqu\u00E9" })] })] })] }), _jsxs("div", { className: "print:hidden flex flex-col sm:flex-row justify-center gap-3 mt-6 px-2", children: [_jsxs("button", { onClick: handlePDF, className: "flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition-colors", children: [_jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" }) }), "T\u00E9l\u00E9charger"] }), _jsxs("button", { onClick: () => window.print(), className: "flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 transition-colors", children: [_jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" }) }), "Imprimer"] }), _jsxs("button", { onClick: () => navigate('/'), className: "flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-600 text-white rounded-lg shadow hover:bg-gray-700 transition-colors", children: [_jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M10 19l-7-7m0 0l7-7m-7 7h18" }) }), "Accueil"] })] })] }));
};
export default ReceiptEnLignePage;
