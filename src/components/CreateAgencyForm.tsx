// src/components/CreateAgencyForm.tsx
import React, { useState } from "react";
import { createAgencyCallable } from "../utils/functions";

export default function CreateAgencyForm({ companyId, onSuccess }: { companyId: string; onSuccess?: (res: any) => void; }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!companyId) {
      setError("CompanyId missing");
      return;
    }
    if (!name.trim()) {
      setError("Nom de l'agence requis");
      return;
    }

    setLoading(true);
    try {
      const payload = { companyId, name: name.trim(), address: address.trim() || null };
      const res = await createAgencyCallable(payload);
      setLoading(false);
      if (onSuccess) onSuccess(res);
      console.log("create agency result", res);
    } catch (err: any) {
      console.error("create agency error (callable):", err);
      setError(err?.message || "Erreur lors de la création de l'agence");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>Nom de l'agence</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label>Adresse</label>
        <input value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <button type="submit" disabled={loading}>{loading ? "Création..." : "Créer l'agence"}</button>
      {error && <div style={{ color: "red" }}>{error}</div>}
    </form>
  );
}
