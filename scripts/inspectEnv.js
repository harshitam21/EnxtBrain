const fs = require('fs');
const path = require('path');
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
const key = env.FIREBASE_PRIVATE_KEY;
console.log('projectId=', env.FIREBASE_PROJECT_ID);
console.log('clientEmail=', env.FIREBASE_CLIENT_EMAIL);
console.log('hasKey=', !!key);
if (key) {
  const normalized = key.replace(/\\n/g, '\n');
  console.log('raw starts=', JSON.stringify(key.slice(0, 40)));
  console.log('normalized starts=', JSON.stringify(normalized.slice(0, 40)));
  console.log('raw includes literal backslash n=', key.includes('\\n'));
  console.log('normalized includes literal backslash n=', normalized.includes('\\n'));
  console.log('raw includes actual newline=', key.includes('\n'));
  console.log('normalized includes actual newline=', normalized.includes('\n'));
  console.log('normalized first line=', normalized.split(/\n/)[0]);
  console.log('normalized last line=', normalized.split(/\n/).slice(-1)[0]);
  console.log('normalized end ok=', normalized.trim().endsWith('-----END PRIVATE KEY-----'));
  console.log('norm len=', normalized.length);
}
