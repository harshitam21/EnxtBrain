// One-shot Firestore seeder (no dotenv dependency)
const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const env = {};
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // remove surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

function normalizePrivateKey(key) {
  if (!key) return key;
  return key.replace(/\\n/g, '\n');
}

async function main() {
  const envPath = path.resolve(__dirname, '..', '.env.local');
  const env = parseEnvFile(envPath);

  const projectId = env.FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const clientEmail = env.FIREBASE_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL;
  const rawPrivateKey = env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY;
  const privateKey = normalizePrivateKey(rawPrivateKey);

  if (!projectId || !clientEmail || !privateKey) {
    console.error('Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY in .env.local');
    process.exit(1);
  }

  try {
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  } catch (err) {
    console.error('Failed to initialize firebase-admin/app:', err.message || err);
    process.exit(1);
  }

  const firestore = getFirestore();

  const dataPath = path.resolve(__dirname, '..', 'data', 'brain-documents.json');
  if (!fs.existsSync(dataPath)) {
    console.error('No data/brain-documents.json found at', dataPath);
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const documents = payload.documents || payload;
  if (!Array.isArray(documents)) {
    console.error('Invalid documents array in data file');
    process.exit(1);
  }

  const collectionRef = firestore.collection('brainDocuments');
  const batch = firestore.batch();

  for (const doc of documents) {
    const id = doc.id || collectionRef.doc().id;
    const ref = collectionRef.doc(id);
    batch.set(ref, doc);
  }

  try {
    await batch.commit();
    console.log('Seeded', documents.length, 'documents into Firestore collection brainDocuments');
    process.exit(0);
  } catch (err) {
    console.error('Batch commit failed:', err.message || err);
    process.exit(1);
  }
}

main();
