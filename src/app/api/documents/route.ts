import { NextRequest, NextResponse } from "next/server";

import { getFirestoreClient } from "../../../lib/firebase-admin";
import { upsertDocumentBatch, deleteDocumentVectors } from "../../../lib/pinecone";
import type { BrainDocument } from "../../../lib/types";
import { encrypt, decrypt } from "../../../lib/encryption";

const getDocumentsCollection = (firestore: any) => firestore.collection("brainDocuments");

const ENCRYPTED_FIELDS = [
  "panCard",
  "aadhaarCard",
  "bankDetails",
  "panCardUrl",
  "aadhaarCardUrl",
  "bankDetailsUrl",
  "offerLetterUrl"
];

const encryptDocumentFields = (doc: BrainDocument): BrainDocument => {
  if (doc.fields) {
    const fields = { ...doc.fields };
    for (const key of ENCRYPTED_FIELDS) {
      if (fields[key] && typeof fields[key] === "string" && fields[key] !== "" && fields[key] !== "[PROTECTED]") {
        fields[key] = encrypt(fields[key]);
      }
    }
    return { ...doc, fields };
  }
  return doc;
};

const decryptDocumentFields = (doc: BrainDocument): BrainDocument => {
  if (doc.fields) {
    const fields = { ...doc.fields };
    for (const key of ENCRYPTED_FIELDS) {
      if (fields[key] && typeof fields[key] === "string") {
        fields[key] = decrypt(fields[key]);
      }
    }
    return { ...doc, fields };
  }
  return doc;
};

const redactDocumentForPinecone = (doc: BrainDocument): BrainDocument => {
  const cleanFields = { ...doc.fields };
  ENCRYPTED_FIELDS.forEach((key) => {
    if (cleanFields[key] && cleanFields[key] !== "") {
      cleanFields[key] = "[REDACTED]";
    }
  });

  // Redact matches in the body
  let cleanBody = doc.body;
  ENCRYPTED_FIELDS.forEach((key) => {
    const labelPattern = key.replace(/([A-Z])/g, " $1").trim();
    const regex = new RegExp(`^\\s*(${key}|${labelPattern})\\s*[:\\-]\\s*.+$`, "gim");
    cleanBody = cleanBody.replace(regex, "$1: [REDACTED]");
  });

  return {
    ...doc,
    body: cleanBody,
    fields: cleanFields
  };
};

const getStoredDocuments = async () => {
  const firestore = getFirestoreClient();
  if (!firestore) {
    throw new Error("Firestore is not configured.");
  }

  const collection = getDocumentsCollection(firestore);
  const snapshot = await collection.get();
  return snapshot.docs.map((doc: any) => decryptDocumentFields(doc.data() as BrainDocument));
};

const SENSITIVE_KEYS = ["panCardUrl", "aadhaarCardUrl", "bankDetailsUrl", "offerLetterUrl"];

const redactSensitiveFields = (doc: BrainDocument): BrainDocument => {
  if (doc.fields) {
    const fields = { ...doc.fields };
    let changed = false;
    for (const key of SENSITIVE_KEYS) {
      if (fields[key] && fields[key] !== "") {
        fields[key] = "[PROTECTED]";
        changed = true;
      }
    }
    if (changed) {
      return { ...doc, fields };
    }
  }
  return doc;
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
  ) {
    return false;
  }
  for (let i = 0; i < d1.tags.length; i++) {
    if (d1.tags[i] !== d2.tags[i]) return false;
  }
  return areFieldsEqual(d1.fields || {}, d2.fields || {});
};

export async function GET(request: NextRequest) {
  try {
    const resyncParam = request.nextUrl.searchParams.get("resync");

    // If `?resync=true` is provided, fetch all docs and re-index in Pinecone.
    if (resyncParam === "true") {
      const documents = await getStoredDocuments();
      const sanitizedDocs = documents.map(redactDocumentForPinecone);
      await upsertDocumentBatch(sanitizedDocs);
      return NextResponse.json({ ok: true, count: documents.length });
    }

    const documents = await getStoredDocuments();
    const redacted = documents.map(redactSensitiveFields);
    return NextResponse.json({ documents: redacted });
  } catch (error) {
    console.error("GET /api/documents error:", error);
    return NextResponse.json(
      {
        error:
          "Unable to load documents from Firestore. Confirm FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are set in .env.local."
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { documents?: BrainDocument[] };

  if (!Array.isArray(body.documents)) {
    return NextResponse.json({ error: "Documents array is required." }, { status: 400 });
  }

  const firestore = getFirestoreClient();
  if (!firestore) {
    return NextResponse.json(
      {
        error: "Firestore is not configured. Please set credentials in .env.local."
      },
      { status: 503 }
    );
  }

  try {
    const collection = getDocumentsCollection(firestore);
    const batch = firestore.batch();
    const existingSnapshot = await collection.get();

    const existingDocsMap = new Map<string, any>(
      existingSnapshot.docs.map((doc: any) => [doc.id, decryptDocumentFields(doc.data() as BrainDocument)])
    );

    const docsToUpsert: BrainDocument[] = [];
    const docIdsToDelete = new Set<string>(existingDocsMap.keys());

    for (const document of body.documents) {
      const documentRef = collection.doc(document.id);
      const existingDoc = existingDocsMap.get(document.id);
      docIdsToDelete.delete(document.id);

      if (existingDoc) {
        // Restore protected fields
        if (existingDoc.fields && document.fields) {
          for (const key of SENSITIVE_KEYS) {
            if (document.fields[key] === "[PROTECTED]" && existingDoc.fields[key]) {
              document.fields[key] = existingDoc.fields[key];
            }
          }
        }

        // Compare to see if it changed
        const hasChanged = !isDocumentEqual(document, existingDoc);
        if (hasChanged) {
          batch.set(documentRef, encryptDocumentFields(document));
          docsToUpsert.push(document);
        }
      } else {
        // New document
        batch.set(documentRef, encryptDocumentFields(document));
        docsToUpsert.push(document);
      }
    }

    // Delete any documents that are no longer in the list
    docIdsToDelete.forEach((deleteId) => {
      batch.delete(collection.doc(deleteId));
    });

    await batch.commit();

    // Only upsert changed documents to Pinecone!
    if (docsToUpsert.length > 0) {
      const sanitizedDocs = docsToUpsert.map(redactDocumentForPinecone);
      console.log(`[POST /api/documents] Upserting ${sanitizedDocs.length} updated/new documents to Pinecone (redacted).`);
      await upsertDocumentBatch(sanitizedDocs);
    }

    // Delete vectors for deleted documents
    if (docIdsToDelete.size > 0) {
      const deleteIds = Array.from(docIdsToDelete);
      console.log(`[POST /api/documents] Deleting ${deleteIds.length} obsolete document vectors from Pinecone.`);
      await deleteDocumentVectors(deleteIds);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/documents error:", error);
    return NextResponse.json(
      {
        error:
          "Unable to save documents to Firestore. Confirm Firestore credentials are valid and the database is reachable."
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const body = (await request.json()) as { documentIds?: string[] };
  const documentIds = body.documentIds;

  if (!Array.isArray(documentIds) || documentIds.length === 0) {
    return NextResponse.json({ error: "Document IDs array is required." }, { status: 400 });
  }

  const firestore = getFirestoreClient();
  if (!firestore) {
    return NextResponse.json(
      {
        error: "Firestore is not configured. Cannot delete documents."
      },
      { status: 503 }
    );
  }

  try {
    // Delete from Firestore
    const collection = getDocumentsCollection(firestore);
    const batch = firestore.batch();
    documentIds.forEach((id) => {
      batch.delete(collection.doc(id));
    });
    await batch.commit();

    // Also delete the vectors from Pinecone
    await deleteDocumentVectors(documentIds);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/documents error:", error);
    return NextResponse.json(
      {
        error: "Unable to delete documents. Check credentials and connectivity."
      },
      { status: 500 }
    );
  }
}
