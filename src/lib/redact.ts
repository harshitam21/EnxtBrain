// src/lib/redact.ts
import type { BrainDocument } from "./types";

/**
 * Remove or mask personally identifiable fields before sending data to external services.
 */
export function redactPII(doc: BrainDocument): BrainDocument {
  const redacted = { ...doc };
  // List of fields that contain sensitive personal data
  const piiFields = [
    "panCardStatus",
    "aadhaarCardStatus",
    "bankDetailsStatus",
    "monthlySalaryInr",
    "currentSalaryRaw",
    "salary",
  ];
  if (redacted.fields) {
    for (const key of piiFields) {
      if (key in redacted.fields) {
        // Replace with generic placeholder – keep field key for schema compatibility
        redacted.fields[key] = "[REDACTED]";
      }
    }
  }
  return redacted;
}
