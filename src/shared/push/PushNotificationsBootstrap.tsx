import React from "react";
import { arrayRemove, arrayUnion, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebaseConfig";
import { registerPushToken } from "./pushNotifications";

const PUSH_TOKEN_STORAGE_KEY = "teliya:push:token:v1";
const PUSH_UID_STORAGE_KEY = "teliya:push:uid:v1";

const PushNotificationsBootstrap: React.FC = () => {
  const { user } = useAuth() as any;

  React.useEffect(() => {
    const syncPushToken = async () => {
      const currentUid = user?.uid ? String(user.uid) : "";
      const previousUid = localStorage.getItem(PUSH_UID_STORAGE_KEY) || "";
      const previousToken = localStorage.getItem(PUSH_TOKEN_STORAGE_KEY) || "";

      if (previousUid && previousUid !== currentUid && previousToken) {
        try {
          await updateDoc(doc(db, "users", previousUid), {
            fcmTokens: arrayRemove(previousToken),
            updatedAt: serverTimestamp(),
          });
        } catch {}
        localStorage.removeItem(PUSH_UID_STORAGE_KEY);
        localStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
      }

      if (!currentUid) return;

      const vapidKey = String(import.meta.env.VITE_FIREBASE_VAPID_KEY || "").trim();
      if (!vapidKey) return;

      const token = await registerPushToken(vapidKey);
      if (!token) return;

      await updateDoc(doc(db, "users", currentUid), {
        fcmTokens: arrayUnion(token),
        fcmUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(() => undefined);

      localStorage.setItem(PUSH_UID_STORAGE_KEY, currentUid);
      localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
    };

    void syncPushToken();
  }, [user?.uid]);

  return null;
};

export default PushNotificationsBootstrap;
