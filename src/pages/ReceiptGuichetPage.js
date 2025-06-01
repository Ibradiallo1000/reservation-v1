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
const ReceiptGuichetPage = () => {
    var _a, _b;
    const { id } = useParams();
    const navigate = useNavigate();
    const [reservation, setReservation] = useState(null);
    const [compagnie, setCompagnie] = useState(null);
    const [agence, setAgence] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const receiptRef = useRef(null);
    // Formatage des dates en français
    const formatDate = (dateString, formatStr) => {
        try {
            const date = typeof dateString === 'string' ? parseISO(dateString) : dateString;
            return format(date, formatStr, { locale: fr });
        }
        catch (_a) {
            return dateString.toString();
        }
    };
    // Génération du numéro de reçu
    const generateReceiptNumber = () => {
        var _a;
        if (!reservation)
            return 'GCH-000000';
        const date = new Date(((_a = reservation.createdAt) === null || _a === void 0 ? void 0 : _a.seconds) * 1000 || Date.now());
        const year = date.getFullYear();
        const num = reservation.id.slice(0, 6).toUpperCase();
        return `GCH-${year}-${num}`;
    };
    useEffect(() => {
        const fetchData = () => __awaiter(void 0, void 0, void 0, function* () {
            if (!id) {
                setError('ID de réservation manquant');
                setLoading(false);
                return;
            }
            try {
                // 1. Chargement de la réservation
                const reservationRef = doc(db, 'reservations', id);
                const reservationSnap = yield getDoc(reservationRef);
                if (!reservationSnap.exists()) {
                    setError('Réservation introuvable');
                    setLoading(false);
                    return;
                }
                const reservationData = reservationSnap.data();
                reservationData.id = reservationSnap.id;
                setReservation(reservationData);
                // 2. Chargement des données compagnie
                if (reservationData.compagnieId) {
                    const compagnieRef = doc(db, 'companies', reservationData.compagnieId);
                    const compagnieSnap = yield getDoc(compagnieRef);
                    if (compagnieSnap.exists()) {
                        const compagnieData = compagnieSnap.data();
                        setCompagnie({
                            nom: compagnieData.nom,
                            logoUrl: compagnieData.logoUrl,
                            couleurPrimaire: compagnieData.couleurPrimaire || '#3b82f6',
                            slug: compagnieData.slug,
                            signatureUrl: compagnieData.signatureUrl
                        });
                    }
                    else {
                        setError('Compagnie introuvable');
                    }
                }
                // 3. Chargement des données agence (optionnel)
                if (reservationData.agenceId) {
                    const agenceRef = doc(db, 'agences', reservationData.agenceId);
                    const agenceSnap = yield getDoc(agenceRef);
                    if (agenceSnap.exists()) {
                        const agenceData = agenceSnap.data();
                        setAgence({
                            nom: agenceData.nom,
                            logoUrl: agenceData.logoUrl,
                            signatureUrl: agenceData.signatureUrl
                        });
                    }
                }
            }
            catch (e) {
                console.error('Erreur Firestore :', e);
                setError('Erreur lors du chargement des données');
            }
            finally {
                setLoading(false);
            }
        });
        fetchData();
    }, [id]);
    const handlePDF = () => {
        if (receiptRef.current) {
            const opt = {
                margin: 10,
                filename: `recu-${generateReceiptNumber()}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    allowTaint: true
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
        return (_jsx("div", { className: "flex items-center justify-center min-h-screen bg-gray-50", children: _jsxs("div", { className: "text-center p-6 max-w-md bg-white rounded-lg shadow-md", children: [_jsx("div", { className: "text-red-500 mb-4", children: _jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-12 w-12 mx-auto", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }) }) }), _jsx("h2", { className: "text-xl font-bold text-gray-800 mb-2", children: "Erreur" }), _jsx("p", { className: "text-gray-600 mb-6", children: error || 'Données introuvables' }), _jsx("button", { onClick: () => navigate(`/compagnie/${(compagnie === null || compagnie === void 0 ? void 0 : compagnie.slug) || 'default'}/guichet`), className: "px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors", children: "Retour au guichet" })] }) }));
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
        paiement: reservation.paiement
    });
    return (_jsxs("div", { className: "bg-gray-50 min-h-screen py-8 px-4 sm:px-6 print:bg-white print:py-0", children: [_jsxs("div", { ref: receiptRef, className: "max-w-2xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden print:shadow-none print:border-none print:rounded-none", style: { borderTop: `8px solid ${compagnie.couleurPrimaire}` }, children: [_jsxs("div", { className: "p-6", style: { backgroundColor: compagnie.couleurPrimaire }, children: [_jsxs("div", { className: "flex justify-between items-start", children: [_jsxs("div", { className: "flex flex-col items-start space-y-3", children: [(agence === null || agence === void 0 ? void 0 : agence.logoUrl) ? (_jsx("img", { src: agence.logoUrl, alt: `Agence ${agence.nom}`, className: "h-12 object-contain bg-white p-1 rounded", onError: (e) => {
                                                    const target = e.target;
                                                    target.src = '/default-agency.png';
                                                } })) : (agence === null || agence === void 0 ? void 0 : agence.nom) ? (_jsx("div", { className: "bg-white px-2 py-1 rounded", children: _jsx("p", { className: "text-xs font-medium", children: agence.nom }) })) : null, _jsx("div", { className: "text-white text-xs bg-black bg-opacity-20 px-2 py-1 rounded", children: _jsxs("p", { children: ["\u00C9mis le ", formatDate(new Date(reservation.createdAt.seconds * 1000), 'dd/MM/yyyy à HH:mm')] }) })] }), _jsx("img", { src: compagnie.logoUrl, alt: compagnie.nom, className: "h-16 object-contain bg-white p-2 rounded-lg shadow", onError: (e) => {
                                            const target = e.target;
                                            target.src = '/default-company.png';
                                        } })] }), _jsxs("div", { className: "mt-4 text-center", children: [_jsx("h1", { className: "text-3xl font-extrabold text-white uppercase tracking-wide", children: compagnie.nom }), (agence === null || agence === void 0 ? void 0 : agence.nom) && (_jsx("p", { className: "text-white text-opacity-80 italic mt-1", children: agence.nom }))] })] }), _jsxs("div", { className: "p-6 sm:p-8", children: [_jsxs("div", { className: "flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-bold text-gray-800", children: "Re\u00E7u de r\u00E9servation" }), _jsxs("p", { className: "text-sm text-gray-500", children: ["Num\u00E9ro: ", generateReceiptNumber()] })] }), _jsx("span", { className: "inline-block text-sm font-semibold px-3 py-1 rounded-full", style: {
                                            backgroundColor: `${compagnie.couleurPrimaire}20`,
                                            color: compagnie.couleurPrimaire
                                        }, children: "R\u00E9servation au guichet" })] }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6 mb-8", children: [_jsxs("div", { className: "bg-gray-50 p-5 rounded-lg border", children: [_jsx("h2", { className: "font-semibold text-lg mb-3", style: { color: compagnie.couleurPrimaire }, children: "Informations passager" }), _jsxs("div", { className: "space-y-3 text-sm", children: [_jsxs("div", { className: "flex justify-between border-b pb-2", children: [_jsx("span", { className: "font-medium text-gray-600", children: "Nom complet :" }), _jsx("span", { className: "text-gray-800", children: reservation.nomClient })] }), _jsxs("div", { className: "flex justify-between border-b pb-2", children: [_jsx("span", { className: "font-medium text-gray-600", children: "T\u00E9l\u00E9phone :" }), _jsx("span", { className: "text-gray-800", children: reservation.telephone })] }), reservation.guichetier && (_jsxs("div", { className: "flex justify-between border-b pb-2", children: [_jsx("span", { className: "font-medium text-gray-600", children: "Guichetier :" }), _jsx("span", { className: "text-gray-800", children: reservation.guichetier })] }))] })] }), _jsxs("div", { className: "bg-gray-50 p-5 rounded-lg border", children: [_jsx("h2", { className: "font-semibold text-lg mb-3", style: { color: compagnie.couleurPrimaire }, children: "D\u00E9tails du voyage" }), _jsxs("div", { className: "space-y-3 text-sm", children: [_jsxs("div", { className: "flex justify-between border-b pb-2", children: [_jsx("span", { className: "font-medium text-gray-600", children: "Trajet :" }), _jsxs("span", { className: "text-gray-800", children: [reservation.depart, " \u2192 ", reservation.arrivee] })] }), _jsxs("div", { className: "flex justify-between border-b pb-2", children: [_jsx("span", { className: "font-medium text-gray-600", children: "Date :" }), _jsx("span", { className: "text-gray-800", children: formatDate(reservation.date, 'EEEE dd MMMM yyyy') })] }), _jsxs("div", { className: "flex justify-between border-b pb-2", children: [_jsx("span", { className: "font-medium text-gray-600", children: "Heure :" }), _jsx("span", { className: "text-gray-800", children: reservation.heure })] }), _jsxs("div", { className: "flex justify-between border-b pb-2", children: [_jsx("span", { className: "font-medium text-gray-600", children: "Places :" }), _jsxs("span", { className: "text-gray-800", children: [reservation.seatsGo, " aller", reservation.seatsReturn ? ` + ${reservation.seatsReturn} retour` : ''] })] })] })] }), _jsxs("div", { className: "bg-gray-50 p-5 rounded-lg border", children: [_jsx("h2", { className: "font-semibold text-lg mb-3", style: { color: compagnie.couleurPrimaire }, children: "D\u00E9tails de paiement" }), _jsxs("div", { className: "space-y-3 text-sm", children: [_jsxs("div", { className: "flex justify-between border-b pb-2", children: [_jsx("span", { className: "font-medium text-gray-600", children: "Montant total :" }), _jsxs("span", { className: "text-gray-800 font-bold", children: [(_b = reservation.montant) === null || _b === void 0 ? void 0 : _b.toLocaleString('fr-FR'), " FCFA"] })] }), _jsxs("div", { className: "flex justify-between border-b pb-2", children: [_jsx("span", { className: "font-medium text-gray-600", children: "Mode de paiement :" }), _jsx("span", { className: "text-gray-800 capitalize", children: reservation.paiement })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "font-medium text-gray-600", children: "Statut :" }), _jsx("span", { className: `px-2 py-1 rounded text-xs ${reservation.statut === 'payé'
                                                                    ? 'bg-green-100 text-green-800'
                                                                    : 'bg-yellow-100 text-yellow-800'}`, children: reservation.statut })] })] })] }), _jsxs("div", { className: "bg-gray-50 p-5 rounded-lg border flex flex-col items-center justify-center", children: [_jsxs("div", { className: "mb-3 text-center", children: [_jsx("h2", { className: "font-semibold text-lg", style: { color: compagnie.couleurPrimaire }, children: "QR Code de validation" }), _jsx("p", { className: "text-xs text-gray-500 mt-1", children: "Pr\u00E9sentez ce code \u00E0 l'embarquement" })] }), _jsx("div", { className: "bg-white p-3 rounded border-2", style: { borderColor: compagnie.couleurPrimaire }, children: _jsx(QRCode, { value: qrContent, size: 128, fgColor: compagnie.couleurPrimaire }) }), _jsxs("p", { className: "mt-3 text-xs text-gray-500 text-center", children: ["Num\u00E9ro: ", generateReceiptNumber()] })] })] }), ((agence === null || agence === void 0 ? void 0 : agence.signatureUrl) || compagnie.signatureUrl) && (_jsx("div", { className: "mt-6 pt-4 border-t flex justify-end", children: _jsxs("div", { className: "text-center", children: [_jsx("p", { className: "text-sm text-gray-500 mb-1", children: "Signature" }), _jsx("img", { src: (agence === null || agence === void 0 ? void 0 : agence.signatureUrl) || compagnie.signatureUrl, alt: "Signature", className: "h-16 object-contain", onError: (e) => {
                                                const target = e.target;
                                                target.style.display = 'none';
                                            } })] }) }))] }), _jsxs("div", { className: "p-4 text-center text-xs text-white", style: { backgroundColor: compagnie.couleurPrimaire }, children: [_jsxs("p", { children: ["Merci pour votre confiance \u2022 ", compagnie.nom] }), _jsx("p", { className: "mt-1 opacity-80", children: "Ce ticket est valable uniquement pour le trajet et la date indiqu\u00E9s" })] })] }), _jsxs("div", { className: "print:hidden flex flex-wrap justify-center gap-4 mt-8", children: [_jsxs("button", { onClick: () => window.print(), className: "flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition-colors", children: [_jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" }) }), "Imprimer"] }), _jsxs("button", { onClick: handlePDF, className: "flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 transition-colors", children: [_jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" }) }), "T\u00E9l\u00E9charger PDF"] }), _jsxs("button", { onClick: () => navigate(`/compagnie/${compagnie.slug}/guichet`), className: "flex items-center gap-2 px-5 py-2.5 bg-gray-600 text-white rounded-lg shadow hover:bg-gray-700 transition-colors", children: [_jsx("svg", { xmlns: "http://www.w3.org/2000/svg", className: "h-5 w-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M10 19l-7-7m0 0l7-7m-7 7h18" }) }), "Retour au guichet"] })] })] }));
};
export default ReceiptGuichetPage;
