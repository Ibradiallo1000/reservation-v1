import * as functions from "firebase-functions";
export const ping = functions.region("europe-west1").https.onCall(async () => ({ ok: true, ts: Date.now() }));
