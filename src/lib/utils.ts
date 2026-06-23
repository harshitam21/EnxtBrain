
import type { BrainDocument } from "./types";

export const asText = (document: BrainDocument, key: string) => String(document.fields[key] ?? "");
export const asNumber = (document: BrainDocument, key: string) => Number(document.fields[key] ?? 0);
export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value);
export const presentLabel = (value: string) => (value.trim() ? value : "Missing");

export const getProjectDeliveryStatus = (project: BrainDocument) => {
  const progress = asNumber(project, "progress");

  if (progress >= 100) {
    return "Completed";
  }

  if (progress > 0) {
    return "In Progress";
  }

  return "Not Yet Started";
};

export const getProjectStatusTone = (status: string): "green" | "amber" | "neutral" => {
  if (status === "Completed") {
    return "green";
  }

  if (status === "In Progress") {
    return "amber";
  }

  return "neutral";
};

export const salaryInputToNumber = (value: string) => {
    const cleaned = value.trim().toLowerCase();
  
    if (!cleaned || cleaned === "-") {
      return 0;
    }
  
    if (cleaned.endsWith("k")) {
      return Number(cleaned.replace("k", "")) * 1000;
    }
  
    return Number(cleaned.replace(/[^0-9.]/g, "")) || 0;
  };
  
export const todayIsoDate = () => new Date().toISOString().slice(0, 10);
export const newId = (prefix: string) => `${prefix}-${Date.now()}`;
