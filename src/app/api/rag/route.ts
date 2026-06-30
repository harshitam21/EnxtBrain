// src/app/api/rag/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
// import { withAuth, User } from "../../../lib/auth"; // Authentication disabled
import { searchDocuments } from "../../../lib/pinecone";
import { callGemini } from "../../../lib/gemini";
import { getFirestoreClient } from "../../../lib/firebase-admin";
import { decryptDocumentFields } from "../../../lib/encryption";

/**
 * RAG endpoint: given a user query, search Pinecone for similar documents,
 * retrieve their full content from Firestore, and generate a response using Gemini.
 */
export const POST = async (request: Request) => {
  try {
    const { query, topK = 5 } = await request.json();
    if (!query || typeof query !== "string" || !query.trim()) {
      return NextResponse.json({ error: "Query must be a non‑empty string" }, { status: 400 });
    }

    // 1. Search Pinecone for matching document IDs
    const matches = await searchDocuments(query, topK);
    if (matches.length === 0) {
      return NextResponse.json({ answer: "No relevant documents found." }, { status: 200 });
    }

    // 2. Retrieve full documents from Firestore (decrypt protected fields)
    const firestore = getFirestoreClient();
    if (!firestore) {
      return NextResponse.json({ error: "Firestore not configured" }, { status: 503 });
    }
    const collection = firestore.collection("brainDocuments");
    const docsSnap = await collection
      .where("id", "in", matches.map((m) => m.id))
      .get();
    const docs = docsSnap.docs.map((doc) => decryptDocumentFields(doc.data() as any));

    // 3. Build a prompt for Gemini that includes the retrieved contexts
    const context = docs.map((d) => d.body).join("\n---\n");
    const prompt = `You are an assistant helping with information from the following documents:\n${context}\n\nAnswer the user's question concisely: ${query}`;

    // 4. Call Gemini
    const geminiResult = await callGemini(prompt);

    return NextResponse.json({ answer: geminiResult }, { status: 200 });
  } catch (e: any) {
    console.error("RAG route error:", e);
    return NextResponse.json({ error: e.message || "Unexpected error" }, { status: 500 });
  }
}