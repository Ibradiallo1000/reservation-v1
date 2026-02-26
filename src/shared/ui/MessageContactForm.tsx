// ✅ MessageContactForm.tsx – formulaire de contact client

import React, { useState } from 'react';
import { useContactMessage } from '@/shared/hooks/useContactMessage';

interface Props {
  primaryColor: string;
  companyId: string;
}

const MessageContactForm: React.FC<Props> = ({ primaryColor, companyId }) => {
  const { sendMessage, loading } = useContactMessage();
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!nom.trim() || !email.trim() || !message.trim()) {
      setError("Tous les champs sont requis.");
      return;
    }

    try {
      await sendMessage({
        nom: nom.trim(),
        email: email.trim(),
        message: message.trim(),
        companyId,
      });
      setSuccess(true);
      setNom('');
      setEmail('');
      setMessage('');
    } catch (err) {
      console.error(err);
      setError("Erreur lors de l'envoi. Veuillez réessayer.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {success && (
        <div className="p-3 rounded bg-green-100 text-green-700 text-sm">
          Merci pour votre message. Nous vous répondrons bientôt.
        </div>
      )}
      {error && (
        <div className="p-3 rounded bg-red-100 text-red-700 text-sm">
          {error}
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
        disabled={loading}
        className="px-4 py-2 font-semibold text-white rounded hover:opacity-90 transition-all"
        style={{ backgroundColor: primaryColor }}
      >
        {loading ? "Envoi en cours..." : "Envoyer le message"}
      </button>
    </form>
  );
};

export default MessageContactForm;
