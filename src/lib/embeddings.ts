import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

/**
 * Gemini embedding model constants.
 * Use "text-embedding-004" for text embeddings (768 dimensions).
 */
const EMBEDDING_MODEL = "gemini-embedding-001";
const BATCH_SIZE = 100;

/**
 * Generate an embedding vector for a single text string using Gemini.
 */
export async function embedText(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  const result = await model.embedContent({
    content: { role: "user", parts: [{ text }] },
    outputDimensionality: 1024
  } as any);
  const embedding = result.embedding;
  return embedding.values;
}

/**
 * Generate embedding vectors for a batch of text strings.
 * Processes in chunks of BATCH_SIZE.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });

  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const chunk = texts.slice(i, i + BATCH_SIZE);
    const batch = await model.batchEmbedContents({
      requests: chunk.map((text) => ({
        content: { role: "user", parts: [{ text }] },
        outputDimensionality: 1024
      } as any))
    });
    for (const embedding of batch.embeddings) {
      results.push(embedding.values);
    }
  }

  return results;
}

const SENSITIVE_KEYS = [
  "panCard",
  "aadhaarCard",
  "bankDetails",
  "panCardUrl",
  "aadhaarCardUrl",
  "bankDetailsUrl",
  "offerLetterUrl"
];

const isSensitiveKey = (key: string): boolean => {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.some((s) => s.toLowerCase() === lower) || lower.endsWith("url");
};

/**
 * Build a searchable text representation of a document for embedding.
 * Concatenates key fields so semantic search works well.
 */
export function buildDocumentSearchText(doc: {
  id: string;
  type: string;
  title: string;
  status: string;
  owner: string;
  tags: string[];
  body: string;
  fields?: Record<string, unknown>;
}): string {
  // Sanitize body by replacing lines matching sensitive patterns
  let cleanBody = doc.body;
  SENSITIVE_KEYS.forEach((key) => {
    const labelPattern = key.replace(/([A-Z])/g, " $1").trim(); // e.g. "panCard" -> "pan Card"
    const regex = new RegExp(`^\\s*(${key}|${labelPattern})\\s*[:\\-]\\s*.+$`, "gim");
    cleanBody = cleanBody.replace(regex, "$1: [REDACTED]");
  });

  const parts: string[] = [
    `Type: ${doc.type}`,
    `Title: ${doc.title}`,
    `Status: ${doc.status}`,
    `Owner: ${doc.owner}`,
    `Tags: ${doc.tags.join(", ")}`,
    cleanBody
  ];

  // Add a few important structured fields
  if (doc.fields) {
    for (const [key, value] of Object.entries(doc.fields)) {
      if (
        typeof value === "string" &&
        value.length > 3 &&
        !["id", "type", "title", "status", "owner"].includes(key) &&
        !isSensitiveKey(key)
      ) {
        parts.push(`${key}: ${value}`);
      }
    }
  }

  return parts.join("\n");
}
