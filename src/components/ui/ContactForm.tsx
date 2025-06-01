// ✅ ContactForm.tsx – formulaire simple de contact

import React, { useState } from 'react';

interface Props {
  primaryColor: string;
}

const ContactForm: React.FC<Props> = ({ primaryColor }) => {
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Formulaire envoyé:', { nom, email, message });
    setSuccess(true);
    setNom('');
    setEmail('');
    setMessage('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {success && (
        <div className="p-3 rounded bg-green-100 text-green-700">
          Merci pour votre message. Nous vous répondrons bientôt.
        </div>
      )}

      <input
        required
        value={nom}
        onChange={(e) => setNom(e.target.value)}
        placeholder="Votre nom"
        className="w-full p-2 border rounded"
      />

      <input
        required
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Votre email"
        className="w-full p-2 border rounded"
      />

      <textarea
        required
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Votre message"
        className="w-full p-2 border rounded min-h-[120px]"
      />

      <button
        type="submit"
        className="px-4 py-2 font-semibold text-white rounded"
        style={{ backgroundColor: primaryColor }}
      >
        Envoyer
      </button>
    </form>
  );
};

export default ContactForm;
