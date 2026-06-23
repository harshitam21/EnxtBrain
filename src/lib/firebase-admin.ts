import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
const privateKey = rawPrivateKey
  ? rawPrivateKey.replace(/\\n/g, "\n").replace(/^"([\s\S]*)"$/, "$1")
  : undefined;

const initFirebaseApp = () => {
  if (getApps().length) {
    return getApp();
  }

  if (!projectId || !clientEmail || !privateKey) {
    return undefined;
  }

  try {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey
      })
    });
  } catch (error) {
    console.error("Firebase initialization failed:", error);
    return undefined;
  }
};

export const getFirestoreClient = () => {
  const app = initFirebaseApp();
  if (!app) {
    return undefined;
  }

  return getFirestore();
};
