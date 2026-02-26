// src/pages/Register.tsx
import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

function useQuery() {
  const { search } = useLocation();
  return Object.fromEntries(new URLSearchParams(search).entries());
}

export default function Register() {
  const q = useQuery();
  const [email, setEmail] = useState(localStorage.getItem("invitedEmail") || "");
  const [message, setMessage] = useState("");
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    setProcessing(false);
  }, []);

  if (processing) {
    return <div className="p-6">Traitement…</div>;
  }

  // Form fallback si l’email n’était pas présent (cas d’ouverture sur un autre device)
  return (
    <div className="p-6 max-w-md mx-auto">
      <h1 className="text-xl font-bold mb-2">Confirmer votre email</h1>
      <p className="text-sm text-gray-700 mb-4">
        Entrez l’adresse email à laquelle le lien a été envoyé pour terminer la connexion.
      </p>
      {message && <p className="mb-3 text-blue-700">{message}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          localStorage.setItem("invitedEmail", email.trim());
          window.location.reload();
        }}
        className="grid gap-3"
      >
        <input
          className="border rounded px-3 py-2"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="votre@email.com"
          required
        />
        <button className="bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700">
          Continuer
        </button>
      </form>
    </div>
  );
}
