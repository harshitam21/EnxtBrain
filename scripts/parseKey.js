const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const envPath = path.resolve(__dirname, '..', '.env.local');
const content = fs.readFileSync(envPath, 'utf8');
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
const rawKey = env.FIREBASE_PRIVATE_KEY;
if (!rawKey) {
  console.error('Missing private key');
  process.exit(1);
}
const normalized = rawKey.replace(/\\n/g, '\n');
console.log('key starts with', normalized.slice(0,30));
console.log('key ends with', normalized.slice(-30));
try {
  const keyObject = crypto.createPrivateKey({ key: normalized, format: 'pem', type: 'pkcs8' });
  console.log('parsed key type', keyObject.type);
  console.log('parsed key asymmetricKeyType', keyObject.asymmetricKeyType);
} catch (err) {
  console.error('parse error', err.message);
  console.error(err);
  process.exit(1);
}
