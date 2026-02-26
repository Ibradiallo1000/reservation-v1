// ✅ src/pages/AjouterPersonnelPlateforme.tsx

import React, { useState } from 'react';
import { createInvitationDoc } from "@/shared/invitations/createInvitationDoc";
import { Button } from "@/shared/ui/button";

const AjouterPersonnelPlateforme: React.FC = () => {
  const [email, setEmail] = useState('');
  const [nom, setNom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [role, setRole] = useState('support');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');

    if (!email || !nom || !role) {
      setMessage("❌ Nom, email et rôle sont obligatoires.");
      return;
    }

    try {
      const result = await createInvitationDoc({
        email: email.trim().toLowerCase(),
        role,
        fullName: nom.trim(),
        ...(telephone.trim() ? { phone: telephone.trim() } : {}),
      });

      setMessage(
        `✅ Invitation créée avec succès. Lien d'activation (à copier et envoyer) : ${result.activationUrl}`
      );
      setEmail('');
      setNom('');
      setTelephone('');
      setRole('support');
    } catch (error: unknown) {
      console.error("Erreur :", error);
      const err = error as { code?: string; message?: string };
      const msg =
        err?.code === "already-exists"
          ? "Une invitation en attente existe déjà pour cet email."
          : err?.message ?? "Une erreur s'est produite.";
      setMessage("❌ " + (typeof msg === "string" ? msg : "Une erreur s'est produite."));
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Ajouter un membre de l'équipe plateforme</h1>
      <form onSubmit={handleSubmit} className="bg-white p-4 rounded-xl border shadow-sm space-y-4">
        <div>
          <label className="block mb-1 font-semibold">Nom complet</label>
          <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} className="w-full border p-2 rounded" required />
        </div>
        <div>
          <label className="block mb-1 font-semibold">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border p-2 rounded" required />
        </div>
        <div>
          <label className="block mb-1 font-semibold">Téléphone (optionnel)</label>
          <input type="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} className="w-full border p-2 rounded" placeholder="ex. 70123456" />
        </div>
        <div>
          <label className="block mb-1 font-semibold">Rôle</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full border p-2 rounded">
            <option value="support">Support</option>
            <option value="commercial">Commercial</option>
            <option value="admin_plateforme">Administrateur Plateforme</option>
          </select>
        </div>
        <Button type="submit" variant="primary">
          Envoyer l'invitation
        </Button>
        {message && <div className="mt-2 text-center text-sm text-gray-700">{message}</div>}
      </form>
    </div>
  );
};

export default AjouterPersonnelPlateforme;
