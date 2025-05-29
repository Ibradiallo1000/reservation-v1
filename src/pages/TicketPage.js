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
// src/pages/TicketPage.tsx
import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import QRCode from 'react-qr-code';
import html2pdf from 'html2pdf.js';
const TicketPage = () => {
    const { id } = useParams();
    const [data, setData] = useState(null);
    const [compagnie, setCompagnie] = useState(null);
    const [loading, setLoading] = useState(true);
    const receiptRef = useRef(null);
    useEffect(() => {
        const fetchData = () => __awaiter(void 0, void 0, void 0, function* () {
            if (!id)
                return;
            try {
                const ref = doc(db, 'reservations', id);
                const snap = yield getDoc(ref);
                if (snap.exists()) {
                    const reservationData = snap.data();
                    setData(Object.assign({ id }, reservationData));
                    if (reservationData.compagnieId) {
                        const compagnieRef = doc(db, 'compagnies', reservationData.compagnieId);
                        const compagnieSnap = yield getDoc(compagnieRef);
                        if (compagnieSnap.exists()) {
                            setCompagnie(compagnieSnap.data());
                        }
                    }
                }
                else {
                    console.error("Réservation introuvable.");
                }
            }
            catch (e) {
                console.error("Erreur Firestore :", e);
            }
            finally {
                setLoading(false);
            }
        });
        fetchData();
    }, [id]);
    const handlePDF = () => {
        if (receiptRef.current) {
            html2pdf()
                .set({
                margin: 0.5,
                filename: `ticket-${id}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
            })
                .from(receiptRef.current)
                .save();
        }
    };
    if (loading) {
        return _jsx("div", { className: "p-8 text-center text-gray-500", children: "Chargement du billet..." });
    }
    if (!data) {
        return _jsx("div", { className: "text-center text-red-600 font-semibold p-8", children: "R\u00E9servation introuvable." });
    }
    const { nomClient, telephone, places, date, heure, depart, arrivee, montant } = data;
    const qrContent = JSON.stringify({
        id,
        nomClient,
        telephone,
        depart,
        arrivee,
        date,
        heure,
    });
    return (_jsxs("div", { className: "min-h-screen bg-gray-100 py-10 px-4 print:bg-white", children: [_jsxs("div", { ref: receiptRef, className: "max-w-2xl mx-auto bg-white p-6 rounded-xl shadow-lg border border-gray-200 print:shadow-none print:border-none", children: [_jsxs("div", { className: "text-center mb-2", children: [(compagnie === null || compagnie === void 0 ? void 0 : compagnie.logoUrl) && (_jsx("img", { src: compagnie.logoUrl, alt: "Logo Compagnie", className: "h-12 mx-auto mb-2" })), _jsx("h1", { className: "text-2xl font-bold uppercase text-gray-800", children: (compagnie === null || compagnie === void 0 ? void 0 : compagnie.nom) || 'Nom Compagnie' })] }), _jsx("div", { className: "text-center text-sm text-gray-500 mb-6", children: "\uD83C\uDFAB Billet \u00E9lectronique \u2013 \u00C0 pr\u00E9senter au d\u00E9part" }), _jsxs("div", { className: "mb-4 text-sm text-gray-800", children: [_jsx("h2", { className: "font-semibold text-yellow-600 mb-2", children: "\uD83D\uDC64 Informations du passager" }), _jsxs("p", { children: [_jsx("strong", { children: "Nom :" }), " ", nomClient] }), _jsxs("p", { children: [_jsx("strong", { children: "T\u00E9l\u00E9phone :" }), " ", telephone] })] }), _jsxs("div", { className: "mb-4 text-sm text-gray-800", children: [_jsx("h2", { className: "font-semibold text-yellow-600 mb-2", children: "\uD83D\uDE8C D\u00E9tails du voyage" }), _jsxs("p", { children: [_jsx("strong", { children: "Trajet :" }), " ", depart, " \u2192 ", arrivee] }), _jsxs("p", { children: [_jsx("strong", { children: "Date :" }), " ", date] }), _jsxs("p", { children: [_jsx("strong", { children: "Heure :" }), " ", heure] }), _jsxs("p", { children: [_jsx("strong", { children: "Nombre de places :" }), " ", places] }), _jsxs("p", { children: [_jsx("strong", { children: "Montant total :" }), " ", montant, " FCFA"] })] }), _jsx("div", { className: "flex justify-center mt-6 mb-4", children: _jsx("div", { className: "border border-gray-300 p-4 rounded-lg bg-white", children: _jsx(QRCode, { value: qrContent, size: 120 }) }) }), _jsxs("p", { className: "text-center text-xs text-gray-400", children: ["ID R\u00E9servation : ", id] })] }), _jsxs("div", { className: "print:hidden flex justify-center gap-4 mt-6", children: [_jsx("button", { onClick: () => window.print(), className: "bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-medium shadow", children: "\uD83D\uDDA8\uFE0F Imprimer" }), _jsx("button", { onClick: handlePDF, className: "bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg font-medium shadow", children: "\u2B07\uFE0F T\u00E9l\u00E9charger PDF" })] })] }));
};
export default TicketPage;
