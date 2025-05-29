import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// ✅ ContactForm.tsx – formulaire simple de contact
import { useState } from 'react';
const ContactForm = ({ primaryColor }) => {
    const [nom, setNom] = useState('');
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [success, setSuccess] = useState(false);
    const handleSubmit = (e) => {
        e.preventDefault();
        console.log('Formulaire envoyé:', { nom, email, message });
        setSuccess(true);
        setNom('');
        setEmail('');
        setMessage('');
    };
    return (_jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [success && (_jsx("div", { className: "p-3 rounded bg-green-100 text-green-700", children: "Merci pour votre message. Nous vous r\u00E9pondrons bient\u00F4t." })), _jsx("input", { required: true, value: nom, onChange: (e) => setNom(e.target.value), placeholder: "Votre nom", className: "w-full p-2 border rounded" }), _jsx("input", { required: true, type: "email", value: email, onChange: (e) => setEmail(e.target.value), placeholder: "Votre email", className: "w-full p-2 border rounded" }), _jsx("textarea", { required: true, value: message, onChange: (e) => setMessage(e.target.value), placeholder: "Votre message", className: "w-full p-2 border rounded min-h-[120px]" }), _jsx("button", { type: "submit", className: "px-4 py-2 font-semibold text-white rounded", style: { backgroundColor: primaryColor }, children: "Envoyer" })] }));
};
export default ContactForm;
