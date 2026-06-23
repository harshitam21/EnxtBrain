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
    return encryptedText; // Fallback to original text if decryption fails
  }
}
