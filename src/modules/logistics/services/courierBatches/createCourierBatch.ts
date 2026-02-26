/**
 * Phase 3: Create a DRAFT batch at origin agency.
 * Path: companies/{companyId}/agences/{agencyId}/batches
 */

import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { agencyBatchesRef } from "../../domain/firestorePaths";
import type { CourierBatch } from "../../domain/courierBatch.types";

export type CreateCourierBatchParams = {
  companyId: string;
  originAgencyId: string;
  tripKey: string;
  vehicleId: string;
  createdBy: string;
};

export async function createCourierBatch(params: CreateCourierBatchParams): Promise<string> {
  const ref = doc(agencyBatchesRef(db, params.companyId, params.originAgencyId));
  const batchId = ref.id;
  const batch: CourierBatch = {
    batchId,
    originAgencyId: params.originAgencyId,
    tripKey: params.tripKey,
    vehicleId: params.vehicleId,
    shipmentIds: [],
    status: "DRAFT",
    createdBy: params.createdBy,
    createdAt: serverTimestamp() as unknown,
  };
  await setDoc(ref, batch);
  return batchId;
}
