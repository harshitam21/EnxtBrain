const fs = require('fs');
const path = require('path');
const { Pinecone } = require('@pinecone-database/pinecone');

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

async function main() {
  const envPath = path.resolve(__dirname, '..', '.env.local');
  const env = parseEnvFile(envPath);

  const PINECONE_API_KEY = env.PINECONE_API_KEY || process.env.PINECONE_API_KEY;
  const PINECONE_INDEX_NAME = env.PINECONE_INDEX_NAME || process.env.PINECONE_INDEX_NAME || 'enxtbrain';
  const PINECONE_HOST = env.PINECONE_HOST || process.env.PINECONE_HOST;

  if (!PINECONE_API_KEY) {
    console.error('Missing PINECONE_API_KEY in .env.local');
    process.exit(1);
  }

  try {
    const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });
    const index = pinecone.index(PINECONE_INDEX_NAME, PINECONE_HOST);
    const stats = await index.describeIndexStats();
    console.log('--- Pinecone Index Stats ---');
    console.log(JSON.stringify(stats, null, 2));
  } catch (err) {
    console.error('Failed to get Pinecone stats:', err.message || err);
  }
  process.exit(0);
}

main();
