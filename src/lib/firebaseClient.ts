// src/lib/firebaseClient.ts
// Compat layer: Firebase is initialized once in src/firebaseConfig.ts.

import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";
import { getFirestore } from "firebase/firestore";
import { app } from "../firebaseConfig";

export { app, getAuth, getFunctions, getFirestore };
export default app;
