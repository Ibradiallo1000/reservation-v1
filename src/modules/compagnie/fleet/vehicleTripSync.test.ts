import { describe, it, expect, vi } from "vitest";

vi.mock("@/firebaseConfig", () => ({ db: {} }));

import {
  deriveVehicleStateFromTripInstance,
  isVehicleCoherentWithTripInstance,
} from "@/modules/compagnie/fleet/syncVehicleWithTripInstance";
import { TRIP_INSTANCE_STATUT_METIER } from "@/modules/compagnie/tripInstances/tripInstanceTypes";

describe("vehicle ↔ tripInstance (départ et cohérence)", () => {
  it("départ en_transit : véhicule attendu en route vers destination", () => {
    const d = deriveVehicleStateFromTripInstance({
      statutMetier: TRIP_INSTANCE_STATUT_METIER.EN_TRANSIT,
      agencyId: "ag_origin",
      destinationAgencyId: "ag_dest",
    });
    expect(d?.statusVehicule).toBe("en_transit");
    expect(d?.currentAgencyId).toBeNull();
    expect(d?.destinationAgencyId).toBe("ag_dest");
    const ok = isVehicleCoherentWithTripInstance(
      {
        statusVehicule: "en_transit",
        currentAgencyId: null,
        destinationAgencyId: "ag_dest",
      },
      {
        statutMetier: TRIP_INSTANCE_STATUT_METIER.EN_TRANSIT,
        agencyId: "ag_origin",
        destinationAgencyId: "ag_dest",
      }
    );
    expect(ok).toBe(true);
  });

  it("retour origine : destination logique = agence d’origine, toujours en_transit", () => {
    const d = deriveVehicleStateFromTripInstance({
      statutMetier: TRIP_INSTANCE_STATUT_METIER.EN_TRANSIT,
      agencyId: "ag_origin",
      destinationAgencyId: "ag_dest",
      isReturnToOrigin: true,
    });
    expect(d?.statusVehicule).toBe("en_transit");
    expect(d?.destinationAgencyId).toBe("ag_origin");
  });

  it("terminé : véhicule disponible à destination", () => {
    const d = deriveVehicleStateFromTripInstance({
      statutMetier: TRIP_INSTANCE_STATUT_METIER.TERMINE,
      agencyId: "ag_origin",
      destinationAgencyId: "ag_dest",
    });
    expect(d?.statusVehicule).toBe("disponible");
    expect(d?.currentAgencyId).toBe("ag_dest");
  });
});
