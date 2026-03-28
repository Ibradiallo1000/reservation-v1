/**
 * Met à jour le miroir public publicShipmentTrack pour suivi client (QR /track/...).
 * Données en clair + vérification « soft » (code ticket ou 4 derniers chiffres) côté app.
 *
 * Ne pas appeler directement depuis les features : utiliser {@link afterLogisticsShipmentChanged}.
 * Complément idéal : Cloud Function onWrite(shipment) → même logique.
 */

import { deleteField, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { Shipment } from "../domain/shipment.types";
import type { ShipmentEvent } from "../domain/logisticsEvents.types";
import type { ClientTrackPayload } from "../domain/publicShipmentTrack.types";
import { eventsRef, publicShipmentTrackRef, shipmentRef } from "../domain/firestorePaths";
import { sha256Hex } from "../utils/shipmentTrackingCrypto";
import { formatFrenchDateTime } from "@/shared/date/fmtFrench";
import {
  friendlyTimelineLine,
  mapShipmentToClientStatusLabel,
  receiverLast4Digits,
} from "../utils/clientTrackLabels";

function tsMs(value: unknown): number {
  if (value == null) return 0;
  const t = value as { toMillis?: () => number; toDate?: () => Date };
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.toDate === "function") return t.toDate().getTime();
  return 0;
}

async function agencyDisplayName(
  companyId: string,
  agencyId: string,
  cache?: Map<string, Promise<string>>
): Promise<string> {
  if (!agencyId) return "—";
  if (cache?.has(agencyId)) return cache.get(agencyId)!;
  const resolveName = (async () => {
    const r = await getDoc(doc(db, "companies", companyId, "agences", agencyId));
    if (!r.exists()) return agencyId;
    const d = r.data() as { nomAgence?: string; nom?: string };
    return String(d.nomAgence ?? d.nom ?? agencyId).trim() || agencyId;
  })();
  if (cache) cache.set(agencyId, resolveName);
  return resolveName;
}

/**
 * Reconstruit le document public à partir de l’envoi + événements (appel authentifié côté tenant).
 */
export async function syncPublicShipmentTrack(companyId: string, shipmentId: string): Promise<void> {
  const sRef = shipmentRef(db, companyId, shipmentId);
  const snap = await getDoc(sRef);
  if (!snap.exists()) return;

  const sh = snap.data() as Shipment;
  const trackingPublicId = sh.trackingPublicId?.trim();
  const token = sh.trackingToken?.trim();
  if (!trackingPublicId || !token) return;

  const trackingTokenHash = await sha256Hex(token);

  const evQ = query(eventsRef(db, companyId), where("shipmentId", "==", shipmentId));
  const evSnap = await getDocs(evQ);
  const raw = evSnap.docs.map((d) => d.data() as ShipmentEvent);
  raw.sort((a, b) => tsMs(a.performedAt) - tsMs(b.performedAt));

  const agencyNameCache = new Map<string, Promise<string>>();
  const timelineEvents = raw.slice(-25);
  const timelineLines: ClientTrackPayload["timelineLines"] = await Promise.all(
    timelineEvents.map(async (e) => {
      const agencyLabel = await agencyDisplayName(companyId, e.agencyId, agencyNameCache);
      return friendlyTimelineLine(e, agencyLabel, formatFrenchDateTime(e.performedAt));
    })
  );

  const currentAgencyId = sh.currentAgencyId ?? sh.currentLocationAgencyId ?? "";
  const [currentAgencyName, destinationAgencyName] = await Promise.all([
    agencyDisplayName(companyId, currentAgencyId, agencyNameCache),
    agencyDisplayName(companyId, sh.destinationAgencyId, agencyNameCache),
  ]);

  const clientStatusLabel = mapShipmentToClientStatusLabel(sh.currentStatus);

  const last4 = receiverLast4Digits(sh.receiver?.phone);
  let phoneGateHash = "";
  let phoneHintLast2 = "";
  if (last4) {
    phoneGateHash = await sha256Hex(`${trackingPublicId}:${last4}`);
    phoneHintLast2 = last4.slice(-2);
  }

  await setDoc(
    publicShipmentTrackRef(db, trackingPublicId),
    {
      companyId,
      trackingTokenHash,
      trackPayloadMode: "plain",
      phoneUnlockAvailable: Boolean(last4),
      phoneGateHash: last4 ? phoneGateHash : deleteField(),
      phoneHintLast2: last4 ? phoneHintLast2 : deleteField(),
      shipmentNumber: sh.shipmentNumber ?? "",
      receiverName: sh.receiver?.name ?? "",
      clientStatusLabel,
      currentAgencyName,
      destinationAgencyName,
      timelineLines,
      encTokenIv: deleteField(),
      encTokenData: deleteField(),
      encPhoneIv: deleteField(),
      encPhoneData: deleteField(),
      trackSchemaVersion: deleteField(),
      currentStatus: deleteField(),
      timeline: deleteField(),
      shipmentId: deleteField(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
