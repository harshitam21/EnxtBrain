import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";

const getEncryptionKey = (): Buffer => {
  const secret =
    process.env.DATABASE_ENCRYPTION_KEY ||
    process.env.FIREBASE_PRIVATE_KEY ||
    "fallback-secret-key-32-bytes-long!!!";
  return crypto.createHash("sha256").update(secret).digest();
};

export function encrypt(text: string): string {
  if (!text) return text;
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex")}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  if (!encryptedText || !encryptedText.includes(":")) return encryptedText;
  try {
    const [ivHex, encrypted] = encryptedText.split(":");
    if (ivHex.length !== 32 || !/^[0-9a-fA-F]{32}$/.test(ivHex)) {
      return encryptedText;
    }
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("Decryption failed:", error);
    return ""; // Return empty string on decryption failure (prevents hex leak in UI)
  }
}

// Functions for handling BrainDocument encryption/redaction

/**
 * Encrypt specified fields of a BrainDocument.
 */
export const encryptDocumentFields = (doc: import("./types").BrainDocument): import("./types").BrainDocument => {
  // panCard / aadhaarCard are human-readable filenames — only encrypt truly sensitive fields.
  const ENCRYPT_FIELDS = [
    "bankDetails",
    "panCardUrl",
    "aadhaarCardUrl",
    "bankDetailsUrl",
    "offerLetterUrl",
  ];
  if (doc.fields) {
    const fields = { ...doc.fields };
    for (const key of ENCRYPT_FIELDS) {
      if (fields[key] && typeof fields[key] === "string" && fields[key] !== "" && fields[key] !== "[PROTECTED]") {
        fields[key] = encrypt(fields[key] as string);
      }
    }
    return { ...doc, fields };
  }
  return doc;
};

/**
 * Decrypt encrypted fields of a BrainDocument.
 * Includes panCard / aadhaarCard to clean up old encrypted values already in Firestore.
 */
export const decryptDocumentFields = (doc: import("./types").BrainDocument): import("./types").BrainDocument => {
  const DECRYPT_FIELDS = [
    "panCard",
    "aadhaarCard",
    "bankDetails",
    "panCardUrl",
    "aadhaarCardUrl",
    "bankDetailsUrl",
    "offerLetterUrl",
  ];
  if (doc.fields) {
    const fields = { ...doc.fields };
    for (const key of DECRYPT_FIELDS) {
      if (fields[key] && typeof fields[key] === "string") {
        fields[key] = decrypt(fields[key] as string);
      }
    }
    return { ...doc, fields };
  }
  return doc;
};

/**
 * Redact sensitive fields for Pinecone indexing.
 */
export const redactDocumentForPinecone = (doc: import("./types").BrainDocument): import("./types").BrainDocument => {
  const ENCRYPTED_FIELDS = [
    "panCard",
    "aadhaarCard",
    "bankDetails",
    "panCardUrl",
    "aadhaarCardUrl",
    "bankDetailsUrl",
    "offerLetterUrl",
  ];
  const cleanFields = { ...doc.fields };
  ENCRYPTED_FIELDS.forEach((key) => {
    if (cleanFields[key] && cleanFields[key] !== "") {
      cleanFields[key] = "[REDACTED]";
    }
  });

  // Redact in body as well (same logic as documents route)
  let cleanBody = doc.body;
  ENCRYPTED_FIELDS.forEach((key) => {
    const labelPattern = key.replace(/([A-Z])/g, " $1").trim();
    const regex = new RegExp(`^\\s*(${key}|${labelPattern})\\s*[:\\-]\\s*.+$`, "gim");
    cleanBody = cleanBody.replace(regex, "$1: [REDACTED]");
  });

  return { ...doc, fields: cleanFields, body: cleanBody };
};
