import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const projectId = process.env.FIREBASE_PROJECT_ID;
const rawClientEmail = process.env.FIREBASE_CLIENT_EMAIL;
// Remove surrounding double quotes if present
const clientEmail = rawClientEmail ? rawClientEmail.replace(/^\"(.*)\"$/, "$1") : undefined;
const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
// Handle multiline private key that may be JSON-escaped and wrapped in quotes
const privateKey = rawPrivateKey
  ? rawPrivateKey
      // Replace escaped newline characters with actual newlines
      .replace(/\\n/g, "\n")
      // Remove surrounding double quotes if present
      .replace(/^"([\s\S]*)"$/, "$1")
      .trim()
  : undefined;

const initFirebaseApp = () => {
  if (getApps().length) {
    return getApp();
  }

  if (!projectId || !clientEmail || !privateKey) {
    console.error('Firebase credentials missing: projectId', !!projectId, 'clientEmail', !!clientEmail, 'privateKey', !!privateKey);
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
