import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

/**
 * Saisie manuelle du suivi si QR indisponible (identifiant public + code).
 */
export default function TrackShipmentFindPage() {
  const navigate = useNavigate();
  const [publicId, setPublicId] = useState("");
  const [token, setToken] = useState("");
  const [pasteUrl, setPasteUrl] = useState("");

  const applyParsedUrl = () => {
    const raw = pasteUrl.trim();
    if (!raw) return;
    try {
      const u = new URL(raw, window.location.origin);
      const path = u.pathname.replace(/^\/+|\/+$/g, "");
      const parts = path.split("/");
      const idx = parts.indexOf("track");
      if (idx >= 0 && parts[idx + 1]) {
        setPublicId(decodeURIComponent(parts[idx + 1]!));
        const t = u.searchParams.get("token");
        if (t) setToken(t);
      }
    } catch {
      /* ignore */
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = publicId.trim();
    const tok = token.trim();
    if (!id) return;
    if (tok) {
      navigate(`/track/${encodeURIComponent(id)}?token=${encodeURIComponent(tok)}`);
    } else {
      navigate(`/track/${encodeURIComponent(id)}`);
    }
  };

  return (
    <div className="mx-auto min-h-[60vh] max-w-md px-4 py-10">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Suivre un envoi</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Saisissez l&apos;identifiant de suivi (QR sans code). Ensuite, sur la page suivante : 4 derniers chiffres du
        téléphone du destinataire ou code ticket. Vous pouvez aussi coller un lien complet avec code.
      </p>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <label className="block text-xs font-semibold uppercase text-gray-500">Coller un lien de suivi</label>
        <textarea
          value={pasteUrl}
          onChange={(e) => setPasteUrl(e.target.value)}
          onBlur={applyParsedUrl}
          rows={2}
          className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-950"
          placeholder="https://…/track/…?token=…"
        />
        <button
          type="button"
          onClick={applyParsedUrl}
          className="mt-2 text-sm font-medium text-orange-600 underline dark:text-orange-400"
        >
          Extraire identifiant et code du lien
        </button>
      </div>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase text-gray-500">Identifiant de suivi</label>
          <input
            value={publicId}
            onChange={(e) => setPublicId(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-950"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase text-gray-500">Code confidentiel (optionnel)</label>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            type="password"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-950"
            autoComplete="off"
          />
        </div>
        <button
          type="submit"
          disabled={!publicId.trim()}
          className="w-full rounded-lg bg-orange-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-orange-500"
        >
          Continuer
        </button>
      </form>

      <p className="mt-8 text-center text-xs text-gray-500 dark:text-gray-400">
        Les agents utilisent la recherche par numéro d&apos;envoi ou ID technique depuis{" "}
        <Link to="/login" className="font-medium text-orange-600 underline dark:text-orange-400">
          l&apos;espace connecté
        </Link>
        .
      </p>
    </div>
  );
}
