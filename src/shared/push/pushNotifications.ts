import { getApp } from "firebase/app";
import {
  getMessaging,
  getToken,
  isSupported as isMessagingSupported,
} from "firebase/messaging";

const PUSH_SW_PATH = "/firebase-messaging-sw.js";

function isSecureForPush(): boolean {
  if (typeof window === "undefined") return false;
  return window.isSecureContext || window.location.hostname === "localhost";
}

export async function registerPushToken(vapidKey: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator)) return null;
  if (!isSecureForPush()) return null;
  if (!vapidKey) return null;

  const supported = await isMessagingSupported().catch(() => false);
  if (!supported) return null;

  const permission = Notification.permission;
  if (permission === "denied") return null;
  if (permission !== "granted") {
    const asked = await Notification.requestPermission();
    if (asked !== "granted") return null;
  }

  const registration = await navigator.serviceWorker.register(PUSH_SW_PATH);
  const messaging = getMessaging(getApp());
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });

  return token || null;
}
