const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
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

  const GEMINI_API_KEY = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  const PINECONE_API_KEY = env.PINECONE_API_KEY || process.env.PINECONE_API_KEY;
  const PINECONE_INDEX_NAME = env.PINECONE_INDEX_NAME || process.env.PINECONE_INDEX_NAME || 'enxtbrain';
  const PINECONE_HOST = env.PINECONE_HOST || process.env.PINECONE_HOST;

  console.log('--- Checking Configurations ---');
  console.log('Gemini API Key Loaded:', !!GEMINI_API_KEY);
  console.log('Pinecone API Key Loaded:', !!PINECONE_API_KEY);
  console.log('Pinecone Index Name:', PINECONE_INDEX_NAME);
  console.log('Pinecone Host:', PINECONE_HOST);

  if (!GEMINI_API_KEY || !PINECONE_API_KEY) {
    console.error('Error: GEMINI_API_KEY and PINECONE_API_KEY must be configured in .env.local');
    process.exit(1);
  }

  // 1. Test Gemini Embedding Generation
  console.log('\n--- 1. Testing Gemini Embedding generation (gemini-embedding-001) ---');
  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
    const text = 'This is a sample document text for testing Gemini embeddings.';
    console.log(`Generating embedding for text: "${text}"`);
    const result = await model.embedContent({
      content: { parts: [{ text }] },
      outputDimensionality: 1024
    });
    const embedding = result.embedding;
    console.log('Embedding Values Count (Dimension):', embedding.values.length);
    if (embedding.values.length === 1024) {
      console.log('SUCCESS: Generated exactly 1024-dimensional embedding!');
    } else {
      console.error(`FAILED: Expected 1024 dimensions, got ${embedding.values.length}`);
      process.exit(1);
    }
  } catch (err) {
    console.error('Gemini Embedding generation failed:', err.message || err);
    process.exit(1);
  }

  // 2. Test Pinecone Connectivity and querying
  console.log('\n--- 2. Testing Pinecone connectivity & queries ---');
  try {
    const pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });
    
    // Check indexes
    const indexesList = await pinecone.listIndexes();
    console.log('Available Indexes:', indexesList.indexes.map(idx => idx.name));

    const indexObj = indexesList.indexes.find(idx => idx.name === PINECONE_INDEX_NAME);
    if (!indexObj) {
      console.warn(`Warning: Index "${PINECONE_INDEX_NAME}" not found in list. Proceeding with host connection...`);
    } else {
      console.log(`Index details for "${PINECONE_INDEX_NAME}":`);
      console.log(`- Dimension: ${indexObj.dimension}`);
      console.log(`- Metric: ${indexObj.metric}`);
      console.log(`- Host: ${indexObj.host}`);
    }

    const index = pinecone.index(PINECONE_INDEX_NAME, PINECONE_HOST);
    
    // Attempt a dummy query with a 1024-dimensional vector of zeroes
    console.log('Attempting to query Pinecone with a dummy 1024-dimension vector...');
    const dummyVector = new Array(1024).fill(0);
    const queryResponse = await index.query({
      vector: dummyVector,
      topK: 1,
      includeMetadata: false
    });
    
    console.log('Pinecone Query Results matches count:', queryResponse.matches ? queryResponse.matches.length : 0);
    console.log('SUCCESS: Pinecone query completed without errors!');
  } catch (err) {
    console.error('Pinecone connection/query failed:', err.message || err);
    process.exit(1);
  }

  console.log('\n--- Integration Tests Completed Successfully! ---');
  process.exit(0);
}

main();
