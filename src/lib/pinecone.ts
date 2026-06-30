import { Pinecone } from "@pinecone-database/pinecone";
import type { Index, RecordMetadata } from "@pinecone-database/pinecone";

import { embedText, embedBatch, buildDocumentSearchText } from "./embeddings";
import type { BrainDocument } from "./types";

/**
 * Pinecone configuration from environment variables.
 */
const PINECONE_API_KEY = process.env.PINECONE_API_KEY ?? "";
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME ?? "enxtbrain";
const PINECONE_CLOUD = process.env.PINECONE_CLOUD ?? "aws";
const PINECONE_HOST = process.env.PINECONE_HOST;
const PINECONE_REGION = process.env.PINECONE_REGION ?? "us-east-1";

type PineconeBrainMetadata = RecordMetadata & {
  type: string;
  title: string;
  status: string;
  owner: string;
  tags: string[];
  updatedAt: string;
  body: string;
};

type PineconeBrainIndex = Index<PineconeBrainMetadata>;

/**
 * Singleton Pinecone client.
 */
let pineconeClient: Pinecone | null = null;
let pineconeIndex: PineconeBrainIndex | null = null;

function getPineconeClient(): Pinecone {
  if (!pineconeClient) {
    if (!PINECONE_API_KEY) {
      throw new Error(
        "PINECONE_API_KEY is not set. Add it to .env.local and restart the server."
      );
    }
    pineconeClient = new Pinecone({
      apiKey: PINECONE_API_KEY
    });
  }
  return pineconeClient;
}

/**
 * Get (or create) the Pinecone index for Enxt Brain.
 * The embedding dimension is 1024 for Gemini gemini-embedding-001.
 */
export async function getIndex(): Promise<PineconeBrainIndex> {
  if (pineconeIndex) return pineconeIndex;

  const client = getPineconeClient();
  const indexName = PINECONE_INDEX_NAME;

  const existingIndexes = await client.listIndexes();

  const indexExists = existingIndexes.indexes?.some(
    (idx) => idx.name === indexName
  );

  if (!indexExists) {
    await client.createIndex({
      name: indexName,
      dimension: 1024,
      metric: "cosine",
      spec: {
        serverless: {
          cloud: PINECONE_CLOUD,
          region: PINECONE_REGION
        }
      }
    });

    // Wait for index to be ready
    let ready = false;
    while (!ready) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const desc = await client.describeIndex(indexName);
      ready = desc.status?.ready ?? false;
    }
  }

  pineconeIndex = client.index<PineconeBrainMetadata>(indexName);
  return pineconeIndex;
}

/**
 * Upsert a single BrainDocument into Pinecone.
 * Generates an embedding and stores it with document metadata.
 */
export async function upsertDocumentVector(
  document: BrainDocument
): Promise<void> {
  const index = await getIndex();
  const searchText = buildDocumentSearchText(document);
  const embedding = await embedText(searchText);

  await index.upsert({
    records: [
      {
        id: document.id,
        values: embedding,
        metadata: {
          type: document.type,
          title: document.title,
          status: document.status,
          owner: document.owner,
          tags: document.tags,
          updatedAt: document.updatedAt,
          body: document.body.slice(0, 2000)
        }
      }
    ]
  });
}

/**
 * Upsert a batch of BrainDocuments into Pinecone.
 */
export async function upsertDocumentBatch(
  documents: BrainDocument[]
): Promise<void> {
  if (documents.length === 0) return;

  const index = await getIndex();
  const searchTexts = documents.map((doc) => buildDocumentSearchText(doc));
  const embeddings = await embedBatch(searchTexts);

  const records = documents.map((doc, i) => ({
    id: doc.id,
    values: embeddings[i],
    metadata: {
      type: doc.type,
      title: doc.title,
      status: doc.status,
      owner: doc.owner,
      tags: doc.tags,
      updatedAt: doc.updatedAt,
      body: doc.body.slice(0, 2000)
    }
  }));

  // Upsert in chunks of 100 (Pinecone limit)
  for (let i = 0; i < records.length; i += 100) {
    await index.upsert({ records: records.slice(i, i + 100) });
  }
}

/**
 * Delete vectors for one or more document IDs.
 */
export async function deleteDocumentVectors(
  documentIds: string[]
): Promise<void> {
  const index = await getIndex();
  await index.deleteMany(documentIds);
}

/**
 * Search Pinecone for documents semantically similar to a query.
 * Returns a list of matching document IDs, scores, and metadata.
 */
export async function searchDocuments(
  query: string,
  topK: number = 8,
  filter?: { type?: string }
): Promise<
  Array<{
    id: string;
    score: number;
    type: string;
    title: string;
    status: string; // This was a duplicate, but keeping for consistency with original
    owner: string;
    tags: string;
    updatedAt: string;
    body: string;
  }>
> {
  const index = await getIndex();
  const queryEmbedding = await embedText(query);

  const results = await index.query({
    vector: queryEmbedding,
    topK,
    includeMetadata: true,
    filter: filter as Record<string, unknown> | undefined
  });

  return (results.matches ?? []).map((match) => ({
    id: match.id,
    score: match.score ?? 0,
    type: match.metadata?.type ?? "",
    title: match.metadata?.title ?? "",
    status: match.metadata?.status ?? "",
    owner: match.metadata?.owner ?? "",
    tags: (match.metadata?.tags ?? []).join(", "),
    updatedAt: (match.metadata?.updatedAt as string) ?? "",
    body: (match.metadata?.body as string) ?? ""
  }));
}

/**
 * Delete all vectors in the index (for re-sync).
 */
export async function clearIndex(): Promise<void> {
  const index = await getIndex();
  await index.deleteAll();
}
