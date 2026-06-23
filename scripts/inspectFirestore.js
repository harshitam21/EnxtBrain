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
    console.error('Missing Firestore config in .env.local');
    process.exit(1);
  }

  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });

  const firestore = getFirestore();
  const collectionRef = firestore.collection('brainDocuments');
  
  try {
    const snapshot = await collectionRef.get();
    console.log('Total Documents in Firestore:', snapshot.docs.length);
    if (snapshot.docs.length > 0) {
      const firstDoc = snapshot.docs[0].data();
      console.log('Fields in the first document:');
      console.log(Object.keys(firstDoc));
      console.log('Sample Document:');
      console.log(JSON.stringify(firstDoc, null, 2));
    }
  } catch (err) {
    console.error('Failed to get documents:', err);
  }
  process.exit(0);
}

main();
