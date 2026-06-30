import { NextRequest, NextResponse } from "next/server";

// Force dynamic rendering — never statically generate this route
export const dynamic = "force-dynamic";

import jwt from "jsonwebtoken";

import { getFirestoreClient } from "../../../lib/firebase-admin";
import { upsertDocumentBatch, deleteDocumentVectors } from "../../../lib/pinecone";
import type { BrainDocument } from "../../../lib/types";
import { decrypt } from "../../../lib/encryption";
import { z } from "zod";
import { promises as fs } from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getDocumentsCollection = (firestore: any) => firestore.collection("brainDocuments");

// ---------------------------------------------------------------------------
// Legacy migration: decrypt any fields that were encrypted in Firestore before
// encryption was removed. Once each document is re-saved, it will be plain text.
// Fields that may have old encrypted values:
const LEGACY_ENCRYPTED_FIELDS = [
  "panCard",
  "aadhaarCard",
  "bankDetails",
  "panCardUrl",
  "aadhaarCardUrl",
  "bankDetailsUrl",
  "offerLetterUrl",
];

// AES-CBC encrypted values have format: 32-hex-char-iv:hex-data
const isEncryptedValue = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{32}:[0-9a-f]{32,}$/i.test(v.trim());

/** On read: decrypt any legacy encrypted fields so UI never sees hex. */
const migrateLegacyEncryptedFields = (doc: BrainDocument): BrainDocument => {
  if (!doc.fields) return doc;
  const fields = { ...doc.fields };
  let changed = false;
  
  for (const key of LEGACY_ENCRYPTED_FIELDS) {
    if (isEncryptedValue(fields[key])) {
      const decrypted = decrypt(fields[key] as string);
      
      // If decryption failed, clear it
      if (!decrypted || isEncryptedValue(decrypted)) {
        fields[key] = "";
        
        // Also clean up the status flag to match the empty state
        if (key === "offerLetter") fields.offerLetterStatus = "Missing";
        if (key === "panCard") fields.panCardStatus = "Missing";
        if (key === "aadhaarCard") fields.aadhaarCardStatus = "Missing";
        if (key === "bankDetails") fields.bankDetailsStatus = "Missing";
      } else {
        fields[key] = decrypted;
      }
      changed = true;
    }
  }
  return changed ? { ...doc, fields } : doc;
};

/** Fields to strip from Pinecone (privacy — not security). */
const PINECONE_REDACT_FIELDS = [
  "panCard", "aadhaarCard", "bankDetails",
  "panCardUrl", "aadhaarCardUrl", "bankDetailsUrl", "offerLetterUrl",
];

const redactDocumentForPinecone = (doc: BrainDocument): BrainDocument => {
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
};

const areFieldsEqual = (f1: Record<string, any>, f2: Record<string, any>): boolean => {
  const keys1 = Object.keys(f1);
  const keys2 = Object.keys(f2);
  if (keys1.length !== keys2.length) return false;
  for (const key of keys1) {
    if (JSON.stringify(f1[key]) !== JSON.stringify(f2[key])) return false;
  }
  return true;
};

const isDocumentEqual = (d1: BrainDocument, d2: BrainDocument): boolean => {
  if (
    d1.title !== d2.title ||
    d1.status !== d2.status ||
    d1.owner !== d2.owner ||
    d1.body !== d2.body ||
    d1.tags.length !== d2.tags.length
  ) return false;
  for (let i = 0; i < d1.tags.length; i++) {
    if (d1.tags[i] !== d2.tags[i]) return false;
  }
  return areFieldsEqual(d1.fields || {}, d2.fields || {});
};

import { sheetEmployeeDocuments } from "../../../lib/sheet-employee-documents";

/** Read all documents from Firestore */
const getStoredDocuments = async (): Promise<BrainDocument[]> => {
  const firestore = getFirestoreClient();
  if (!firestore) throw new Error("Firestore is not configured.");
  const collection = getDocumentsCollection(firestore);
  const snapshot = await collection.get();
  // migrateLegacyEncryptedFields cleans up any old encrypted values on read
  return snapshot.docs.map((doc: any) => migrateLegacyEncryptedFields(doc.data() as BrainDocument));
};

/** Seed Firestore + Pinecone from sheet imports in the background */
const seedFirestoreInBackground = (docs: BrainDocument[]) => {
  void (async () => {
    try {
      const firestore = getFirestoreClient();
      if (!firestore) return;
      const collection = getDocumentsCollection(firestore);
      const CHUNK = 400; // Firestore batch limit is 500 ops
      for (let i = 0; i < docs.length; i += CHUNK) {
        const batch = firestore.batch();
        docs.slice(i, i + CHUNK).forEach((doc) => {
          batch.set(collection.doc(doc.id), doc);
        });
        await batch.commit();
      }
      const sanitized = docs.map(redactDocumentForPinecone);
      await upsertDocumentBatch(sanitized);
      console.log(`[auto-seed] Seeded ${docs.length} documents into Firestore + Pinecone.`);
    } catch (e) {
      console.error("[auto-seed] Failed:", e);
    }
  })();
};

// ---------------------------------------------------------------------------
// GET /api/documents
// ---------------------------------------------------------------------------
export const GET = async (request: NextRequest) => {
  try {
    // ?resync=true triggers a Pinecone re-index from Firestore
    if (request.nextUrl.searchParams.get("resync") === "true") {
      seedFirestoreInBackground(sheetEmployeeDocuments);
      return NextResponse.json({ ok: true, count: sheetEmployeeDocuments.length, message: "Started background resync from sheetEmployeeDocuments" });
    }

    const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
    // Default size raised to 500 to load all documents in one shot
    const size = Number(request.nextUrl.searchParams.get("size") ?? "500");
    const start = (page - 1) * size;

    // Verify if client has unlocked the vault session
    const cookieToken = request.cookies.get("vault_auth_token")?.value;
    let isVaultAuthorized = false;
    if (cookieToken) {
      try {
        const secret = process.env.JWT_SECRET || "default_jwt_vault_secret";
        jwt.verify(cookieToken, secret);
        isVaultAuthorized = true;
      } catch {
        // Vault auth invalid/expired
      }
    }

    // Load stored documents
    let documents = await getStoredDocuments();

    // Firestore empty → fall back to the sheet employee documents and seed Firestore
    if (documents.length === 0) {
      console.log("[GET /api/documents] Firestore empty — falling back to sheetEmployeeDocuments");
      documents = sheetEmployeeDocuments;
      if (documents.length > 0) {
        seedFirestoreInBackground(documents);
      }
    }

    const SENSITIVE_URLS = ["panCardUrl", "aadhaarCardUrl", "bankDetailsUrl", "offerLetterUrl"];
    const SENSITIVE_VALUES = ["panCard", "aadhaarCard", "bankDetails", "bankDetailsDisplay", "offerLetter"];

    const redactSensitiveFields = (doc: BrainDocument): BrainDocument => {
      if (!doc.fields || doc.type !== "employee") return doc;
      const fields = { ...doc.fields };
      let changed = false;

      // Always redact URL targets
      for (const key of SENSITIVE_URLS) {
        if (fields[key] && fields[key] !== "" && fields[key] !== "[PROTECTED]") {
          fields[key] = "[PROTECTED]";
          changed = true;
        }
      }

      // If vault is not authorized, redact text field values
      if (!isVaultAuthorized) {
        for (const key of SENSITIVE_VALUES) {
          if (fields[key] && fields[key] !== "" && fields[key] !== "[PROTECTED]") {
            fields[key] = "[PROTECTED]";
            changed = true;
          }
        }
        
        // Clear payment details text if locked
        if (fields.paymentHistory && Array.isArray(fields.paymentHistory) && fields.paymentHistory.length > 0) {
          fields.paymentHistory = [];
          changed = true;
        }
      }

      return changed ? { ...doc, fields } : doc;
    };

    // Protect sensitive document details in client payload
    const redacted = documents.map(redactSensitiveFields);
    const paged = redacted.slice(start, start + size);

    return NextResponse.json({
      documents: paged,
      page,
      size,
      total: redacted.length,
      vaultAuthorized: isVaultAuthorized
    });
  } catch (error) {
    console.error("GET /api/documents error:", error);
    
    // Serve from static sheet array as a zero-dependency fallback so the UI never crashes
    try {
      const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
      const size = Number(new URL(request.url).searchParams.get("size") ?? "500");
      
      // Read vault session for fallback path
      const cookieToken = request.cookies.get("vault_auth_token")?.value;
      let isVaultAuthorizedFallback = false;
      if (cookieToken) {
        try {
          const secret = process.env.JWT_SECRET || "default_jwt_vault_secret";
          jwt.verify(cookieToken, secret);
          isVaultAuthorizedFallback = true;
        } catch { /* ignore */ }
      }

      const SENSITIVE_URLS = ["panCardUrl", "aadhaarCardUrl", "bankDetailsUrl", "offerLetterUrl"];
      const SENSITIVE_VALUES = ["panCard", "aadhaarCard", "bankDetails", "bankDetailsDisplay", "offerLetter"];

      const redactSensitiveFields = (doc: BrainDocument): BrainDocument => {
        if (!doc.fields || doc.type !== "employee") return doc;
        const fields = { ...doc.fields };
        let changed = false;

        for (const key of SENSITIVE_URLS) {
          if (fields[key] && fields[key] !== "" && fields[key] !== "[PROTECTED]") {
            fields[key] = "[PROTECTED]";
            changed = true;
          }
        }

        if (!isVaultAuthorizedFallback) {
          for (const key of SENSITIVE_VALUES) {
            if (fields[key] && fields[key] !== "" && fields[key] !== "[PROTECTED]") {
              fields[key] = "[PROTECTED]";
              changed = true;
            }
          }
          if (fields.paymentHistory && Array.isArray(fields.paymentHistory) && fields.paymentHistory.length > 0) {
            fields.paymentHistory = [];
            changed = true;
          }
        }

        return changed ? { ...doc, fields } : doc;
      };
      
      const redactedFallback = sheetEmployeeDocuments.map(redactSensitiveFields);
      return NextResponse.json({
        documents: redactedFallback.slice((page - 1) * size, page * size),
        page,
        size,
        total: redactedFallback.length,
        vaultAuthorized: isVaultAuthorizedFallback,
        _source: "sheet-fallback",
      });
    } catch { /* ignore */ }

    return NextResponse.json(
      { error: "Unable to load documents. Check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in .env.local." },
      { status: 500 }
    );
  }
};

// ---------------------------------------------------------------------------
// POST /api/documents  — upsert a batch of documents
// ---------------------------------------------------------------------------
export const POST = async (request: NextRequest) => {
  const rawBody = await request.json();

  const DocumentSchema = z.object({
    documents: z.array(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        type: z.string().optional(),
        status: z.string().optional(),
        owner: z.string().optional(),
        updatedAt: z.string().optional(),
        tags: z.array(z.string()).optional(),
        fields: z.record(z.any()).optional(),
        body: z.string().optional(),
      })
    ),
  });

  const parseResult = DocumentSchema.safeParse(rawBody);
  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid request payload", details: parseResult.error.format() }, { status: 400 });
  }

  const { documents } = parseResult.data;

  const firestore = getFirestoreClient();
  if (!firestore) {
    return NextResponse.json({ error: "Firestore is not configured." }, { status: 503 });
  }

  try {
    const collection = getDocumentsCollection(firestore);
    const batch = firestore.batch();
    const existingSnapshot = await collection.get();

    const existingDocsMap = new Map<string, BrainDocument>(
      existingSnapshot.docs.map((doc: any) => [doc.id, migrateLegacyEncryptedFields(doc.data() as BrainDocument)])
    );

    const docsToUpsert: BrainDocument[] = [];
    const docIdsToDelete = new Set<string>(existingDocsMap.keys());

    for (const document of documents) {
      const documentRef = collection.doc(document.id);
      const existingDoc = existingDocsMap.get(document.id);
      docIdsToDelete.delete(document.id);

      const fullDoc: BrainDocument = {
        ...document,
        type: (document as any).type ?? "employee",
        title: document.title ?? "",
        status: (document as any).status ?? "",
        owner: document.owner ?? "",
        updatedAt: (document as any).updatedAt ?? "",
        tags: (document as any).tags ?? [],
        fields: document.fields ?? {},
        body: (document as any).body ?? "",
      } as BrainDocument;

      const SENSITIVE_KEYS = ["panCardUrl", "aadhaarCardUrl", "bankDetailsUrl", "offerLetterUrl"];
      if (existingDoc) {
        // Restore protected fields that the client sent back as "[PROTECTED]"
        if (existingDoc.fields && fullDoc.fields) {
          for (const key of SENSITIVE_KEYS) {
            if (fullDoc.fields[key] === "[PROTECTED]" && existingDoc.fields[key]) {
              (fullDoc.fields as any)[key] = existingDoc.fields[key];
            }
          }
        }
        if (!isDocumentEqual(fullDoc, existingDoc)) {
          // Store as plain text — no encryption
          batch.set(documentRef, fullDoc);
          docsToUpsert.push(fullDoc);
        }
      } else {
        batch.set(documentRef, fullDoc);
        docsToUpsert.push(fullDoc);
      }
    }

    // Delete documents removed from the list
    docIdsToDelete.forEach((deleteId) => batch.delete(collection.doc(deleteId)));

    await batch.commit();

    // Sync only changed docs to Pinecone
    if (docsToUpsert.length > 0) {
      const sanitized = docsToUpsert.map(redactDocumentForPinecone);
      console.log(`[POST /api/documents] Upserting ${sanitized.length} docs to Pinecone.`);
      await upsertDocumentBatch(sanitized);
    }

    // Delete vectors for removed documents
    if (docIdsToDelete.size > 0) {
      const deleteIds = Array.from(docIdsToDelete);
      console.log(`[POST /api/documents] Deleting ${deleteIds.length} obsolete vectors from Pinecone.`);
      await deleteDocumentVectors(deleteIds);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/documents error:", error);
    return NextResponse.json(
      { error: "Unable to save documents to Firestore. Check credentials and connectivity." },
      { status: 500 }
    );
  }
};

// ---------------------------------------------------------------------------
// DELETE /api/documents  — remove specific documents
// ---------------------------------------------------------------------------
export const DELETE = async (request: NextRequest) => {
  const body = (await request.json()) as { documentIds?: string[] };
  const documentIds = body.documentIds;

  if (!Array.isArray(documentIds) || documentIds.length === 0) {
    return NextResponse.json({ error: "Document IDs array is required." }, { status: 400 });
  }

  const firestore = getFirestoreClient();
  if (!firestore) {
    return NextResponse.json({ error: "Firestore is not configured." }, { status: 503 });
  }

  try {
    const collection = getDocumentsCollection(firestore);
    const batch = firestore.batch();
    documentIds.forEach((id) => batch.delete(collection.doc(id)));
    await batch.commit();

    await deleteDocumentVectors(documentIds);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/documents error:", error);
    return NextResponse.json({ error: "Unable to delete documents. Check credentials and connectivity." }, { status: 500 });
  }
};
