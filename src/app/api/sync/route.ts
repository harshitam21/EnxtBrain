// src/app/api/sync/route.ts
import { NextResponse } from "next/server";
import { getFirestoreClient } from "../../../lib/firebase-admin";
import type { BrainDocument } from "../../../lib/types";
import { sheetEmployeeDocuments } from "../../../lib/sheet-employee-documents";

export const dynamic = "force-dynamic";

/**
 * GET /api/sync
 * Reads the sheet imports array and upserts them into Firestore.
 */
export const GET = async (request: Request) => {
  const firestore = getFirestoreClient();
  if (!firestore) {
    return NextResponse.json({ error: "Firestore not configured" }, { status: 503 });
  }

  try {
    const docs = sheetEmployeeDocuments;

    if (docs.length === 0) {
      return NextResponse.json({ ok: false, error: "No documents found in sheetEmployeeDocuments" }, { status: 422 });
    }

    const collection = firestore.collection("brainDocuments");
    // Firestore batch has a 500-op limit — chunk into batches of 400
    const CHUNK = 400;
    for (let i = 0; i < docs.length; i += CHUNK) {
      const batch = firestore.batch();
      docs.slice(i, i + CHUNK).forEach((doc) => {
        const ref = collection.doc(doc.id);
        // Save as plain text
        batch.set(ref, doc);
      });
      await batch.commit();
    }

    // Upsert into Pinecone for search (with basic field value masking for safety)
    const PINECONE_REDACT_FIELDS = [
      "panCard", "aadhaarCard", "bankDetails",
      "panCardUrl", "aadhaarCardUrl", "bankDetailsUrl", "offerLetterUrl"
    ];
    const sanitized = docs.map((doc) => {
      const cleanFields = { ...doc.fields };
      for (const key of PINECONE_REDACT_FIELDS) {
        if (cleanFields[key] && cleanFields[key] !== "") cleanFields[key] = "[REDACTED]";
      }
      let cleanBody = doc.body ?? "";
      for (const key of PINECONE_REDACT_FIELDS) {
        const labelPattern = key.replace(/([A-Z])/g, " $1").trim();
        const regex = new RegExp(`^\\s*(${key}|${labelPattern})\\s*[:\\-]\\s*.+$`, "gim");
        cleanBody = cleanBody.replace(regex, "$1: [REDACTED]");
      }
      return { ...doc, body: cleanBody, fields: cleanFields };
    });

    const { upsertDocumentBatch } = require("../../../lib/pinecone");
    await upsertDocumentBatch(sanitized);

    return NextResponse.json({ ok: true, count: docs.length });
  } catch (error) {
    console.error("SYNC error:", error);
    return NextResponse.json({ error: "Failed to sync documents" }, { status: 500 });
  }
};
