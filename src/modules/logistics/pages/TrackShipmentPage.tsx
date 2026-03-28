import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { ShipmentEvent } from "../domain/logisticsEvents.types";
import type { ClientTrackPayload, PublicShipmentTrackDoc, PublicShipmentTimelineEntry } from "../domain/publicShipmentTrack.types";
import { publicShipmentTrackRef } from "../domain/firestorePaths";
import { sha256Hex } from "../utils/shipmentTrackingCrypto";
import { friendlyTimelineLine, mapShipmentToClientStatusLabel } from "../utils/clientTrackLabels";

type LoadedDoc =
  | { kind: "encrypted_legacy"; row: PublicShipmentTrackDoc }
  | { kind: "plain" | "legacy_v1"; row: PublicShipmentTrackDoc };

function classifyPublicTrackDoc(row: PublicShipmentTrackDoc): LoadedDoc["kind"] {
  const isPlain =
    row.trackPayloadMode === "plain" ||
    (row.clientStatusLabel !== undefined && Array.isArray(row.timelineLines));
  if (isPlain) return "plain";
  if (row.encTokenData && row.encTokenIv) return "encrypted_legacy";
  return "legacy_v1";
}

function rowToDisplayPayload(row: PublicShipmentTrackDoc, kind: "plain" | "legacy_v1"): ClientTrackPayload {
  if (kind === "plain") {
    return {
      v: 1,
      shipmentNumber: row.shipmentNumber ?? "",
      receiverName: row.receiverName ?? "",
      clientStatusLabel: row.clientStatusLabel ?? "—",
      currentAgencyName: row.currentAgencyName ?? "—",
      destinationAgencyName: row.destinationAgencyName ?? "—",
      timelineLines: row.timelineLines ?? [],
    };
  }
  return {
    v: 1,
    shipmentNumber: row.shipmentNumber ?? "",
    receiverName: row.receiverName ?? "",
    clientStatusLabel: mapShipmentToClientStatusLabel(row.currentStatus ?? ""),
    currentAgencyName: row.currentAgencyName ?? "—",
    destinationAgencyName: row.destinationAgencyName ?? "—",
    timelineLines: (row.timeline ?? []).map((e: PublicShipmentTimelineEntry) =>
      friendlyTimelineLine(
        {
          eventType: e.eventType as ShipmentEvent["eventType"],
          agencyId: "",
          shipmentId: "",
          performedBy: "",
          performedAt: null,
        },
        e.agencyLabel,
        e.atLabel
      )
    ),
  };
}

async function verifyUnlock(
  publicId: string,
  row: PublicShipmentTrackDoc,
  tokenTry: string,
  last4Try: string
): Promise<boolean> {
  const tok = tokenTry.trim();
  if (tok) {
    const h = await sha256Hex(tok);
    if (h === row.trackingTokenHash) return true;
  }
  const digits = last4Try.replace(/\D/g, "").slice(-4);
  if (digits.length === 4 && row.phoneGateHash) {
    const gh = await sha256Hex(`${publicId}:${digits}`);
    if (gh === row.phoneGateHash) return true;
  }
  return false;
}

export default function TrackShipmentPage() {
  const { trackingPublicId } = useParams<{ trackingPublicId: string }>();
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get("token")?.trim() ?? "";

  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<LoadedDoc | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  const [unlockLast4, setUnlockLast4] = useState("");
  const [unlockToken, setUnlockToken] = useState("");
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [urlTokenError, setUrlTokenError] = useState<string | null>(null);

  const tryUrlUnlock = useCallback(async (publicId: string, row: PublicShipmentTrackDoc, token: string) => {
    const ok = await verifyUnlock(publicId, row, token, "");
    if (ok) {
      setUnlocked(true);
      setUrlTokenError(null);
    } else {
      setUrlTokenError("Le code dans l’adresse du lien est incorrect. Utilisez les champs ci-dessous.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFatalError(null);
      setLoaded(null);
      setUnlocked(false);
      setUnlockError(null);
      setUrlTokenError(null);

      const id = trackingPublicId?.trim();
      if (!id) {
        setFatalError("Identifiant manquant.");
        setLoading(false);
        return;
      }

      try {
        const snap = await getDoc(publicShipmentTrackRef(db, id));
        if (cancelled) return;
        if (!snap.exists()) {
          setFatalError("Suivi introuvable ou identifiant incorrect.");
          setLoading(false);
          return;
        }
        const row = snap.data() as PublicShipmentTrackDoc;
        const kind = classifyPublicTrackDoc(row);

        if (kind === "encrypted_legacy") {
          setLoaded({ kind: "encrypted_legacy", row });
          setLoading(false);
          return;
        }

        setLoaded({ kind, row });

        if (tokenFromUrl) {
          await tryUrlUnlock(id, row, tokenFromUrl);
        }
      } catch {
        if (!cancelled) setFatalError("Impossible de charger le suivi. Réessayez plus tard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trackingPublicId, tokenFromUrl, tryUrlUnlock]);

  const publicId = trackingPublicId?.trim() ?? "";

  const unlockCopy = useMemo(() => {
    const row = loaded && loaded.kind !== "encrypted_legacy" ? loaded.row : null;
    const phoneOk = Boolean(row?.phoneUnlockAvailable && row.phoneGateHash);
    return { row, phoneOk };
  }, [loaded]);

  const onUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicId || !loaded || loaded.kind === "encrypted_legacy") return;
    setUnlockBusy(true);
    setUnlockError(null);
    try {
      const ok = await verifyUnlock(publicId, loaded.row, unlockToken, unlockLast4);
      if (ok) {
        setUnlocked(true);
        setUnlockToken("");
        setUnlockLast4("");
      } else {
        setUnlockError(
          "Vérifiez le code sur le reçu / étiquette, ou les 4 derniers chiffres du téléphone du destinataire (tel qu’indiqué à l’envoi)."
        );
      }
    } finally {
      setUnlockBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-gray-600 dark:text-gray-400">
        Chargement…
      </div>
    );
  }

  if (fatalError && !loaded) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {fatalError}
        </p>
        <Link to="/track" className="mt-4 inline-block text-sm font-medium text-orange-600 underline">
          Autre mode de recherche
        </Link>
      </div>
    );
  }

  if (loaded?.kind === "encrypted_legacy") {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Suivi d&apos;envoi</h1>
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          Ce suivi est en cours de mise à jour sur nos serveurs. Réessayez dans quelques minutes après un mouvement du colis
          (transit, arrivée…), ou contactez l&apos;agence qui a enregistré l&apos;envoi.
        </p>
        <Link to="/track" className="mt-6 inline-block text-sm font-medium text-orange-600 underline">
          Autre mode de recherche
        </Link>
      </div>
    );
  }

  if (!loaded) {
    return null;
  }

  const { row, kind } = loaded;

  if (!unlocked) {
    const hint2 = row.phoneHintLast2?.trim();
    return (
      <div className="mx-auto max-w-md px-4 py-8">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Suivi d&apos;envoi</h1>

        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200">
          <p className="font-semibold text-gray-900 dark:text-gray-100">🔐 Pour voir les détails</p>
          <ul className="mt-2 list-inside list-disc space-y-1.5 text-gray-700 dark:text-gray-300">
            {unlockCopy.phoneOk ? (
              <li>
                Entrez les <strong>4 derniers chiffres</strong> du <strong>téléphone du destinataire</strong> (celui donné
                à l&apos;enregistrement du colis).
              </li>
            ) : null}
            <li>
              <strong>Ou</strong> entrez le <strong>code confidentiel</strong> indiqué sur votre <strong>reçu</strong> ou{" "}
              <strong>étiquette</strong> (souvent une longue suite de caractères — pas le n° de colis seul).
            </li>
          </ul>
          {unlockCopy.phoneOk && hint2 ? (
            <p className="mt-3 rounded-md bg-white px-2 py-1.5 text-xs text-gray-600 dark:bg-gray-950 dark:text-gray-400">
              Indication : le numéro enregistré pour le destinataire se termine par <span className="font-mono font-semibold">••{hint2}</span>
            </p>
          ) : null}
        </div>

        {urlTokenError ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            {urlTokenError}
          </p>
        ) : null}

        <form onSubmit={onUnlockSubmit} className="mt-6 space-y-4">
          {unlockCopy.phoneOk ? (
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-500">4 derniers chiffres (tél. destinataire)</label>
              <input
                value={unlockLast4}
                onChange={(e) => setUnlockLast4(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                maxLength={8}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm tracking-widest dark:border-gray-600 dark:bg-gray-950"
                placeholder="ex. 1234"
              />
            </div>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Pour cet envoi, seul le <strong>code du reçu</strong> permet d&apos;afficher le suivi (numéro incomplet à
              l&apos;enregistrement).
            </p>
          )}
          <div>
            <label className="block text-xs font-semibold uppercase text-gray-500">Code sur le reçu / étiquette</label>
            <input
              value={unlockToken}
              onChange={(e) => setUnlockToken(e.target.value)}
              type="password"
              autoComplete="off"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-950"
              placeholder="Collez le code si vous l’avez"
            />
          </div>
          {unlockError ? <p className="text-sm text-red-600 dark:text-red-400">{unlockError}</p> : null}
          <button
            type="submit"
            disabled={unlockBusy}
            className="w-full rounded-lg bg-orange-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-orange-500"
          >
            {unlockBusy ? "Vérification…" : "Afficher le suivi"}
          </button>
        </form>

        <Link to="/track" className="mt-8 inline-block text-sm text-orange-600 underline dark:text-orange-400">
          Suivre un autre envoi
        </Link>
      </div>
    );
  }

  const display = rowToDisplayPayload(row, kind);

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Suivi d&apos;envoi</h1>
      {display.shipmentNumber ? (
        <p className="mt-1 font-mono text-sm text-gray-600 dark:text-gray-400">N° {display.shipmentNumber}</p>
      ) : null}
      {display.receiverName ? (
        <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">Destinataire : {display.receiverName}</p>
      ) : null}

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <p className="text-xs font-semibold uppercase text-gray-500">Statut</p>
        <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">{display.clientStatusLabel}</p>
        <p className="mt-4 text-xs font-semibold uppercase text-gray-500">Agence actuelle</p>
        <p className="mt-1 text-sm text-gray-800 dark:text-gray-200">{display.currentAgencyName}</p>
        <p className="mt-4 text-xs font-semibold uppercase text-gray-500">Destination prévue</p>
        <p className="mt-1 text-sm text-gray-800 dark:text-gray-200">{display.destinationAgencyName}</p>
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Parcours</h2>
        <ul className="mt-2 space-y-2">
          {display.timelineLines.length === 0 ? (
            <li className="text-sm text-gray-500">Aucun événement enregistré pour le moment.</li>
          ) : (
            [...display.timelineLines].reverse().map((e, i) => (
              <li
                key={`${e.sub ?? ""}-${i}`}
                className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm dark:border-gray-800 dark:bg-gray-950"
              >
                <div className="flex items-start gap-2">
                  <span className="shrink-0 text-base leading-none text-green-600 dark:text-green-400" aria-hidden>
                    {e.done ? "✓" : "○"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{e.text}</div>
                    {e.sub ? <div className="text-xs text-gray-600 dark:text-gray-400">{e.sub}</div> : null}
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>

      <Link to="/track" className="mt-8 inline-block text-sm text-orange-600 underline dark:text-orange-400">
        Suivre un autre envoi
      </Link>
    </div>
  );
}
