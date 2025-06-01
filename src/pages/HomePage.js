import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// src/pages/HomePage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bus, MapPin, Search, Settings } from 'lucide-react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
const HomePage = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        departure: '',
        arrival: '',
    });
    const auth = getAuth();
    onAuthStateChanged(auth, () => { });
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => (Object.assign(Object.assign({}, prev), { [name]: value })));
    };
    const handleSubmit = (e) => {
        e.preventDefault();
        navigate('/resultats', { state: Object.assign({}, formData) });
    };
    return (_jsxs(_Fragment, { children: [_jsx("header", { className: "bg-white shadow-md p-4", children: _jsxs("div", { className: "flex justify-between items-center max-w-7xl mx-auto", children: [_jsxs("div", { className: "flex items-center space-x-2", children: [_jsx(Bus, { className: "h-8 w-8 text-yellow-600" }), _jsx("span", { className: "text-xl font-bold text-yellow-600", children: "TIKETA" })] }), _jsx("div", { children: _jsx("button", { onClick: () => navigate('/login'), className: "text-gray-600 hover:text-yellow-700", title: "Connexion", children: _jsx(Settings, { className: "h-6 w-6" }) }) })] }) }), _jsx("div", { className: "relative bg-cover bg-center h-[450px] md:h-[500px]", style: {
                    backgroundImage: 'url(https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&q=80)',
                }, children: _jsxs("div", { className: "absolute inset-0 bg-black bg-opacity-50 flex flex-col justify-center px-4", children: [_jsxs("div", { className: "text-center text-white", children: [_jsx("h1", { className: "text-3xl md:text-5xl font-bold", children: "R\u00E9servez votre voyage en toute simplicit\u00E9" }), _jsx("p", { className: "mt-2 text-lg md:text-xl", children: "Trouvez et achetez vos billets de bus partout au Mali et en Afrique" })] }), _jsxs("form", { onSubmit: handleSubmit, className: "bg-white/20 backdrop-blur rounded-xl shadow-lg mt-6 p-6 w-full max-w-4xl mx-auto text-left", children: [_jsxs("div", { className: "grid md:grid-cols-2 sm:grid-cols-2 grid-cols-1 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "text-sm text-white", children: "Ville de d\u00E9part" }), _jsxs("div", { className: "relative", children: [_jsx(MapPin, { className: "absolute left-2 top-2.5 h-5 w-5 text-gray-500" }), _jsx("input", { type: "text", name: "departure", value: formData.departure, onChange: handleChange, required: true, placeholder: "Ex: Bamako", className: "pl-9 w-full border border-gray-300 rounded py-2 px-2 text-gray-800" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "text-sm text-white", children: "Ville d'arriv\u00E9e" }), _jsxs("div", { className: "relative", children: [_jsx(MapPin, { className: "absolute left-2 top-2.5 h-5 w-5 text-gray-500" }), _jsx("input", { type: "text", name: "arrival", value: formData.arrival, onChange: handleChange, required: true, placeholder: "Ex: Dakar", className: "pl-9 w-full border border-gray-300 rounded py-2 px-2 text-gray-800" })] })] })] }), _jsx("div", { className: "mt-6 flex justify-center sm:justify-end", children: _jsxs("button", { type: "submit", className: "flex items-center bg-yellow-600 text-white px-6 py-2 rounded hover:bg-yellow-700", children: [_jsx(Search, { className: "h-5 w-5 mr-2" }), "Rechercher un trajet"] }) })] }), _jsxs("div", { className: "mt-6 flex flex-wrap justify-center gap-4 text-sm text-white", children: [_jsx("button", { onClick: () => navigate('/ClientMesReservationsPage'), className: "bg-white/70 backdrop-blur text-gray-800 border px-4 py-2 rounded shadow hover:shadow-md", children: "Voir mes r\u00E9servations" }), _jsx("button", { onClick: () => navigate('/tracking'), className: "bg-white/70 backdrop-blur text-gray-800 border px-4 py-2 rounded shadow hover:shadow-md", children: "Suivre un trajet" }), _jsx("button", { onClick: () => navigate('/aide'), className: "bg-white/70 backdrop-blur text-gray-800 border px-4 py-2 rounded shadow hover:shadow-md", children: "Aide" })] })] }) })] }));
};
export default HomePage;
