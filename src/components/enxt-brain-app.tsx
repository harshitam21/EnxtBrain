"use client";

import {
  BadgeIndianRupee,
  Bot,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronDown,
  Database,
  Eye,
  FilePenLine,
  FileText,
  LayoutDashboard,
  Menu,
  Pencil,
  MessageSquareText,
  PanelLeft,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  SquareKanban,
  Trash2,
  Users,
  Lock,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FormEvent, Fragment, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";


import type { BrainDocument, BrainField, ChangeRequest, ChatMessage, EmployeePayment } from "../lib/types";

import LeadCard from "./lead-card";
import ProjectCard from "./project-card";
import EmployeeCard from "./employee-card";
import DatePickerField from "./date-picker-field";
import "react-datepicker/dist/react-datepicker.css";

type View = "dashboard" | "employees" | "projects" | "crm" | "documents";
type EmployeeEditState = {
  name?: string;
  status?: string;
  dateOfJoining?: string;
  currentSalaryRaw?: string;
  paymentHistory?: EmployeePayment[];
  [key: string]: string | string[] | EmployeePayment[] | undefined;
};
type LeadEditState = Record<string, string>;
type ProjectEditState = Record<string, string>;
type ViewedEmployeeDocument = {
  employeeId: string;
  fieldKey: string;
  employeeName: string;
  label: string;
  status: string;
  value: string;
  url: string;
};

const navItems: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "dashboard", label: "Command", icon: LayoutDashboard },
  { id: "employees", label: "Employees", icon: Users },
  { id: "projects", label: "Projects", icon: SquareKanban },
  { id: "crm", label: "CRM", icon: BriefcaseBusiness },
  { id: "documents", label: "Documents", icon: FileText }
];

export const asText = (document: BrainDocument, key: string) => String(document.fields[key] ?? "");
export const asNumber = (document: BrainDocument, key: string) => Number(document.fields[key] ?? 0);
export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value);
export const presentLabel = (value: string) => (value.trim() ? value : "Missing");

const employeeStatusRank = (employee: BrainDocument) => {
  const status = asText(employee, "status");

  if (status === "Active") {
    return 0;
  }

  if (status === "On Hold") {
    return 1;
  }

  if (status === "Exited") {
    return 2;
  }

  return 3;
};

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

const salaryInputToNumber = (value: string) => {
  const cleaned = value.trim().toLowerCase();

  if (!cleaned || cleaned === "-") {
    return 0;
  }

  if (cleaned.endsWith("k")) {
    return Number(cleaned.replace("k", "")) * 1000;
  }

  return Number(cleaned.replace(/[^0-9.]/g, "")) || 0;
};

export const normalizePaymentHistory = (value?: BrainField): EmployeePayment[] => {
  if (value === undefined || value === null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === "string") {
        const amount = item.trim();
        return amount ? [{ date: "", amount, notes: "Imported payment note" }] : [];
      }

      return [
        {
          date: String(item.date ?? ""),
          amount: String(item.amount ?? ""),
          notes: String(item.notes ?? "")
        }
      ];
    });
  }

  return String(value)
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((amount) => ({ date: "", amount, notes: "Imported payment note" }));
};

const extractFieldValuesFromBody = (body: string) => {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, line) => {
      const match = line.match(/^\s*([^:\-]+?)\s*[:\-]\s*(.+)$/);
      if (!match) {
        return acc;
      }

      acc[match[1].trim().toLowerCase()] = match[2].trim();
      return acc;
    }, {});
};

const parseDocumentFieldsFromBody = (document: BrainDocument, body: string) => {
  const values = extractFieldValuesFromBody(body);
  const parsed: Record<string, string> = {};

  if (document.type === "employee") {
    if (values.name) parsed.name = values.name;
    if (values.status) parsed.status = values.status;
    if (values.salary) parsed.currentSalaryRaw = values.salary;
    if (values["monthly salary"]) parsed.currentSalaryRaw = values["monthly salary"];
    if (values["current salary"]) parsed.currentSalaryRaw = values["current salary"];
    if (values["date of joining"]) parsed.dateOfJoining = values["date of joining"];
    if (values["date of leaving"]) parsed.dateOfLeaving = values["date of leaving"];
    if (values["communication status"]) parsed.communicationStatus = values["communication status"];
    if (values["next steps"]) parsed.nextSteps = values["next steps"];
    if (values.deadline) parsed.deadline = values.deadline;
    // NOTE: panCard, aadhaarCard, bankDetails and their URL fields are intentionally
    // excluded here — they must NEVER be parsed from body text because Firestore
    // bodies may contain stale encrypted hex values that would override the properly
    // decrypted field values. These fields are managed exclusively via the edit form.
  }

  if (document.type === "project") {
    if (values.title) parsed.title = values.title;
    if (values.client) parsed.client = values.client;
    if (values.phase) parsed.phase = values.phase;
    if (values.health) parsed.health = values.health;
    if (values.priority) parsed.priority = values.priority;
    if (values.owner) parsed.owner = values.owner;
    if (values["due date"]) parsed.dueDate = values["due date"];
    if (values.budget) parsed.budgetInr = values.budget;
    if (values["budget inr"]) parsed.budgetInr = values["budget inr"];
    if (values.progress) parsed.progress = values.progress;
    if (values.risk) parsed.risk = values.risk;
    if (values.objective) parsed.objective = values.objective;
    if (values.scope) parsed.scope = values.scope;
    if (values["current status"]) parsed.currentStatus = values["current status"];
    if (values["success metric"]) parsed.successMetric = values["success metric"];
    if (values["data sources"]) parsed.dataSources = values["data sources"];
  }

  if (document.type === "lead") {
    if (values.company) parsed.company = values.company;
    if (values["contact person"]) parsed.contactPerson = values["contact person"];
    if (values.stage) parsed.stage = values.stage;
    if (values["contract value"]) parsed.contractValue = values["contract value"];
    if (values["potential value"] || values["potential value inr"]) {
      parsed.potentialValueInr = values["potential value"] || values["potential value inr"];
    }
    if (values["communication status"]) parsed.communicationStatus = values["communication status"];
    if (values["next steps"]) parsed.nextSteps = values["next steps"];
    if (values.deadline) parsed.deadline = values.deadline;
    if (values["last communication date"]) parsed.lastCommunicationDate = values["last communication date"];
  }

  return parsed;
};
const removeStructuredBodySection = (body: string) => {
  const marker = "---";
  const markerIndex = body.indexOf(marker);
  return markerIndex === -1 ? body.trim() : body.slice(0, markerIndex).trim();
};
const buildStructuredBody = (document: BrainDocument, body: string, fields: Record<string, BrainField>) => {
  const narrative = removeStructuredBodySection(body);
  const sectionLines: string[] = [];

  if (document.type === "employee") {
    // Only write non-sensitive fields into the body text.
    // panCard, aadhaarCard, bankDetails and their URL fields are excluded because
    // Firestore stores them encrypted — writing encrypted hex into the body text
    // caused applyDocumentBodyUpdates to re-read encrypted values back as field values.
    const keys: Array<[string, string]> = [
      ["name", "Name"],
      ["status", "Status"],
      ["currentSalaryRaw", "Salary"],
      ["dateOfJoining", "Date of Joining"],
      ["dateOfLeaving", "Date of Leaving"],
      ["communicationStatus", "Communication Status"],
      ["nextSteps", "Next Steps"],
      ["deadline", "Deadline"]
    ];

    for (const [fieldKey, label] of keys) {
      const value = fields[fieldKey];
      if (value !== undefined && value !== "") {
        sectionLines.push(`${label}: ${String(value)}`);
      }
    }
  }

  if (document.type === "project") {
    const keys: Array<[string, string]> = [
      ["title", "Title"],
      ["client", "Client"],
      ["phase", "Phase"],
      ["health", "Health"],
      ["priority", "Priority"],
      ["owner", "Owner"],
      ["dueDate", "Due Date"],
      ["budgetInr", "Budget INR"],
      ["progress", "Progress"],
      ["risk", "Risk"]
    ];

    for (const [fieldKey, label] of keys) {
      const value = fields[fieldKey];
      if (value !== undefined && value !== "") {
        sectionLines.push(`${label}: ${String(value)}`);
      }
    }
  }

  if (document.type === "lead") {
    const keys: Array<[string, string]> = [
      ["company", "Company"],
      ["contactPerson", "Contact Person"],
      ["stage", "Stage"],
      ["contractValue", "Contract Value"],
      ["potentialValueInr", "Potential Value INR"],
      ["communicationStatus", "Communication Status"],
      ["nextSteps", "Next Steps"],
      ["deadline", "Deadline"],
      ["lastCommunicationDate", "Last Communication Date"]
    ];

    for (const [fieldKey, label] of keys) {
      const value = fields[fieldKey];
      if (value !== undefined && value !== "") {
        sectionLines.push(`${label}: ${String(value)}`);
      }
    }
  }

  if (!sectionLines.length) {
    return body.trim();
  }

  return `${narrative}\n\n---\n${sectionLines.join("\n")}`;
};

const applyDocumentBodyUpdates = (
  document: BrainDocument,
  body: string,
  explicitFields?: Record<string, BrainField>
): BrainDocument => {
  const parsedFields = parseDocumentFieldsFromBody(document, body);
  const updatedFields: Record<string, BrainField> = { ...document.fields, ...parsedFields, ...explicitFields };

  if (document.type === "employee") {
    if (parsedFields.currentSalaryRaw) {
      updatedFields.monthlySalaryInr = salaryInputToNumber(parsedFields.currentSalaryRaw);
    }
    if (parsedFields.status) {
      updatedFields.status = parsedFields.status;
    }
    updatedFields.paymentHistory = normalizePaymentHistory(updatedFields.paymentHistory);
  }

  if (document.type === "project") {
    if (parsedFields.budgetInr) {
      updatedFields.budgetInr = salaryInputToNumber(parsedFields.budgetInr);
    }
    if (parsedFields.progress) {
      updatedFields.progress = salaryInputToNumber(parsedFields.progress);
    }
  }

  if (document.type === "lead") {
    if (parsedFields.potentialValueInr) {
      updatedFields.potentialValueInr = salaryInputToNumber(parsedFields.potentialValueInr);
    }
  }

  const updatedDocument: BrainDocument = {
    ...document,
    title:
      document.type === "employee"
        ? `${String(updatedFields.name ?? asText(document, "name"))} - ${String(updatedFields.status ?? asText(document, "status"))} Employee`
        : document.type === "project"
          ? String(updatedFields.title ?? document.title)
          : document.type === "lead"
            ? String(updatedFields.company ?? document.title)
            : document.title,
    status: document.type === "project" || document.type === "lead" ? String(updatedFields.status ?? document.status) : String(updatedFields.status ?? document.status),
    fields: updatedFields,
    body: buildStructuredBody(document, body, updatedFields),
    updatedAt: new Date().toISOString().slice(0, 10)
  };

  return updatedDocument;
};

export const paymentHistoryTotalPaid = (history: EmployeePayment[] = []) =>
  history.reduce((total, payment) => {
    const amounts = String(payment.amount).match(/\d[\d,]*/g)?.map((item) => Number(item.replace(/,/g, ""))) ?? [];
    return total + amounts.reduce((sum, amount) => sum + amount, 0);
  }, 0);

export const paymentHistoryLines = (history: EmployeePayment[] = []) => history;

const leadStages = ["Old Leads", "Contacts", "Proposal", "Project Started", "Completed"] as const;
const projectStages = ["Not Yet Started", "In Progress", "Completed"] as const;
const todayIsoDate = () => new Date().toISOString().slice(0, 10);
const newId = (prefix: string) => `${prefix}-${Date.now()}`;
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizedText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const compactText = (value: string) => normalizedText(value).replace(/\s+/g, "");

const cleanAiValue = (value: string) =>
  value
    .replace(/\b(please|thanks|thank you|ok|okay)\b.*$/i, "")
    .replace(/[.,;!?]+$/g, "")
    .replace(/^["']|["']$/g, "")
    .trim();

const extractAiFieldValue = (prompt: string, labels: string[]) => {
  for (const label of labels) {
    const labelPattern = escapeRegExp(label).replace(/\s+/g, "\\s+");
    const patterns = [
      new RegExp(`\\b(?:set|change|update|mark|make)\\s+(?:the\\s+)?${labelPattern}\\s+(?:to|as|=|:)\\s+(.+)$`, "i"),
      new RegExp(`\\b(?:set|change|update|mark|make)\\s+(?:the\\s+)?${labelPattern}\\s+of\\s+.+?\\s+(?:to|as|=|:)\\s+(.+)$`, "i"),
      new RegExp(`\\b(?:set|change|update|mark|make)\\s+.+?'?s?\\s+${labelPattern}\\s+(?:to|as|=|:)\\s+(.+)$`, "i"),
      new RegExp(`\\b${labelPattern}\\s*(?:to|as|=|:)\\s+(.+)$`, "i")
    ];

    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      if (match?.[1]) {
        return cleanAiValue(match[1]);
      }
    }
  }

  return "";
};

const parseAiChangeFields = (prompt: string, document: BrainDocument): Record<string, BrainField> => {
  const updates: Record<string, BrainField> = {};
  const lowerPrompt = prompt.toLowerCase();

  if (document.type === "employee") {
    const salary = extractAiFieldValue(prompt, ["salary", "current salary", "monthly salary", "stipend"]);
    const status = extractAiFieldValue(prompt, ["status"]);
    const dateOfJoining = extractAiFieldValue(prompt, ["date of joining", "joining date"]);
    const dateOfLeaving = extractAiFieldValue(prompt, ["date of leaving", "leaving date"]);
    const name = extractAiFieldValue(prompt, ["name"]);

    if (salary) {
      updates.currentSalaryRaw = salary;
      updates.monthlySalaryInr = salaryInputToNumber(salary);
    }
    if (status) updates.status = status;
    if (!status && /\b(active|exited|on hold)\b/i.test(prompt)) {
      updates.status = prompt.match(/\b(active|exited|on hold)\b/i)?.[1] ?? asText(document, "status");
    }
    if (dateOfJoining) updates.dateOfJoining = dateOfJoining;
    if (dateOfLeaving) updates.dateOfLeaving = dateOfLeaving;
    if (name) updates.name = name;
  }

  if (document.type === "lead") {
    const stage = extractAiFieldValue(prompt, ["stage", "status"]);
    const contractValue = extractAiFieldValue(prompt, ["contract value"]);
    const potentialValue = extractAiFieldValue(prompt, ["potential value", "potential value inr"]);
    const communicationStatus = extractAiFieldValue(prompt, ["communication status"]);
    const nextSteps = extractAiFieldValue(prompt, ["next steps", "next step", "next action"]);
    const deadline = extractAiFieldValue(prompt, ["deadline", "due date"]);
    const contactPerson = extractAiFieldValue(prompt, ["contact person", "contact"]);
    const projectDetails = extractAiFieldValue(prompt, ["project details", "project"]);

    const movedStage = leadStages.find((item) => lowerPrompt.includes(`to ${item.toLowerCase()}`));

    if (stage) updates.stage = stage;
    if (!stage && movedStage) updates.stage = movedStage;
    if (contractValue) updates.contractValue = contractValue;
    if (potentialValue) updates.potentialValueInr = salaryInputToNumber(potentialValue);
    if (communicationStatus) updates.communicationStatus = communicationStatus;
    if (nextSteps) {
      updates.nextSteps = nextSteps;
      updates.nextAction = nextSteps;
    }
    if (deadline) updates.deadline = deadline;
    if (contactPerson) updates.contactPerson = contactPerson;
    if (projectDetails) updates.projectDetails = projectDetails;
  }

  if (document.type === "project") {
    const status = extractAiFieldValue(prompt, ["status", "phase"]);
    const progress = extractAiFieldValue(prompt, ["progress"]);
    const health = extractAiFieldValue(prompt, ["health"]);
    const priority = extractAiFieldValue(prompt, ["priority"]);
    const owner = extractAiFieldValue(prompt, ["owner"]);
    const dueDate = extractAiFieldValue(prompt, ["due date", "deadline"]);
    const budget = extractAiFieldValue(prompt, ["budget", "budget inr"]);
    const risk = extractAiFieldValue(prompt, ["risk"]);
    const currentStatus = extractAiFieldValue(prompt, ["current status"]);

    const movedStatus = projectStages.find((item) => lowerPrompt.includes(`to ${item.toLowerCase()}`));

    if (status) {
      updates.status = status;
      updates.phase = status;
    }
    if (!status && movedStatus) {
      updates.status = movedStatus;
      updates.phase = movedStatus;
    }
    if (progress) updates.progress = salaryInputToNumber(progress);
    if (health) updates.health = health;
    if (priority) updates.priority = priority;
    if (owner) updates.owner = owner;
    if (dueDate) updates.dueDate = dueDate;
    if (budget) updates.budgetInr = salaryInputToNumber(budget);
    if (risk) updates.risk = risk;
    if (currentStatus) updates.currentStatus = currentStatus;
  }

  return updates;
};

function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}

const ensureEmployeePaymentHistory = (docs: BrainDocument[]): BrainDocument[] => {
  return docs.map((doc) => {
    if (doc.type === "employee") {
      const paymentHistory = doc.fields.paymentHistory;
      if (!paymentHistory || (Array.isArray(paymentHistory) && paymentHistory.length === 0)) {
        const history: EmployeePayment[] = [];
        const fields = doc.fields || {};
        if (fields.paidJun5) history.push({ date: "2026-06-05", amount: String(fields.paidJun5), notes: "June 5/6 payment" });
        if (fields.paidMay7) history.push({ date: "2026-05-07", amount: String(fields.paidMay7), notes: "May 7 payment" });
        if (fields.paidMarch7) history.push({ date: "2026-03-07", amount: String(fields.paidMarch7), notes: "March 7 payment" });
        if (fields.paidFebStipend) history.push({ date: "2026-02-28", amount: String(fields.paidFebStipend), notes: "February stipend" });
        if (fields.paidFeb3) history.push({ date: "2026-02-03", amount: String(fields.paidFeb3), notes: "February 3 payment" });
        return {
          ...doc,
          fields: {
            ...doc.fields,
            paymentHistory: history
          }
        };
      }
    }
    return doc;
  });
};

export default function EnxtBrainApp() {
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [documents, setDocuments] = useState<BrainDocument[]>([]);

  useEffect(() => {
    document.documentElement.removeAttribute("data-theme");
    localStorage.removeItem("theme");
  }, []);
  const [hasLoadedBackendDocuments, setHasLoadedBackendDocuments] = useState(false);
  const [documentQuery, setDocumentQuery] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [editText, setEditText] = useState("");
  const [writeMode, setWriteMode] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [isBrainThinking, setIsBrainThinking] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "intro-founder",
      role: "founder",
      content: "What should I look at today?"
    },
    {
      id: "intro-brain",
      role: "brain",
      content:
        "Enxt Brain sees 16 employees, 10 AI projects, 0 clients, and 40 leads. Employee docs and the CRM pipeline are ready to search, edit, and update."
    }
  ]);
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const hasInitialized = useRef(false);
  const [syncStatus, setSyncStatus] = useState<"synced" | "syncing" | "error">("synced");
  const [retryCount, setRetryCount] = useState(0);

  const fetchDocuments = async () => {
    try {
      const response = await fetch(`/api/documents?size=500&_t=${Date.now()}`, { cache: "no-store" });
      if (response.ok) {
        const payload = (await response.json()) as { documents?: BrainDocument[]; total?: number; _source?: string; vaultAuthorized?: boolean };
        if (payload.documents?.length) {
          const newDocuments = ensureEmployeePaymentHistory(payload.documents);
          setDocuments(newDocuments);
          localStorage.setItem("documents", JSON.stringify(newDocuments));
          return { documents: newDocuments, vaultAuthorized: !!payload.vaultAuthorized };
        }
      }
    } catch (err) {
      console.error("[EnxtBrain] Failed to load documents:", err);
    }
    return null;
  };

  useEffect(() => {
    if (hasInitialized.current) return;
    const initializeState = async () => {
      const savedView = localStorage.getItem("activeView");
      const savedDocumentId = localStorage.getItem("selectedDocumentId");

      if (savedView) setActiveView(savedView as View);
      if (savedDocumentId) setSelectedDocumentId(savedDocumentId);

      try {
        const result = await fetchDocuments();
        if (result && result.documents.length) {
          const restoredDoc = result.documents.find((d) => d.id === savedDocumentId) ?? result.documents[0];
          if (restoredDoc) {
            setEditText(removeStructuredBodySection(restoredDoc.body));
          }
        }
      } catch (err) {
        console.error("[EnxtBrain] Failed to load documents from backend:", err);
        // Last resort: use localStorage only if the backend is completely unreachable
        const savedDocumentsRaw = localStorage.getItem("documents");
        if (savedDocumentsRaw) {
          try {
            const parsed = JSON.parse(savedDocumentsRaw) as BrainDocument[];
            if (Array.isArray(parsed) && parsed.length) {
              setDocuments(ensureEmployeePaymentHistory(parsed));
              const restoredDoc = parsed.find((d) => d.id === savedDocumentId) ?? parsed[0];
              if (restoredDoc) setEditText(removeStructuredBodySection(restoredDoc.body));
            }
          } catch {
            // ignore
          }
        }
      } finally {
        setHasLoadedBackendDocuments(true);
      }
    };

    void initializeState();
    hasInitialized.current = true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    localStorage.setItem("activeView", activeView);
  }, [activeView]);

  useEffect(() => {
    if (selectedDocumentId) {
      localStorage.setItem("selectedDocumentId", selectedDocumentId);
    }
  }, [selectedDocumentId]);

  const latestDocsRef = useRef(documents);
  useEffect(() => {
    latestDocsRef.current = documents;
  }, [documents]);

  const triggerSync = (currentDocuments: BrainDocument[]) => {
    setSyncStatus("syncing");
    fetch("/api/documents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ documents: currentDocuments })
    })
      .then((res) => {
        if (!res.ok) throw new Error("Sync failed");
        setSyncStatus("synced");
        setRetryCount(0);
      })
      .catch((err) => {
        console.error("Sync error:", err);
        setSyncStatus("error");
        if (retryCount < 3) {
          console.log(`Scheduling retry attempt #${retryCount + 1} in 5s...`);
          setTimeout(() => {
            setRetryCount((prev) => prev + 1);
          }, 5000);
        }
      });
  };

  useEffect(() => {
    // Always persist to localStorage so changes survive refresh
    try {
      localStorage.setItem("documents", JSON.stringify(documents));
    } catch {
      // ignore storage errors
    }

    // Persist documents to backend when available (debounced by 1500ms)
    if (hasLoadedBackendDocuments) {
      const timer = setTimeout(() => {
        triggerSync(latestDocsRef.current);
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [documents, hasLoadedBackendDocuments]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle automatic background retries when retryCount increments
  useEffect(() => {
    if (retryCount > 0 && retryCount <= 3 && syncStatus === "error" && hasLoadedBackendDocuments) {
      triggerSync(latestDocsRef.current);
    }
  }, [retryCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const employees = useMemo(() => documents.filter((document) => document.type === "employee"), [documents]);
  const projects = useMemo(() => documents.filter((document) => document.type === "project"), [documents]);
  const clients = useMemo(() => documents.filter((document) => document.type === "client"), [documents]);
  const leads = useMemo(() => documents.filter((document) => document.type === "lead"), [documents]);

  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) ?? documents[0];
  const monthlyPayroll = employees
    .filter((employee) => asText(employee, "status") === "Active")
    .reduce((total, employee) => total + asNumber(employee, "monthlySalaryInr"), 0);
  const projectBudget = projects.reduce((total, project) => total + asNumber(project, "budgetInr"), 0);
  const pipelineValue = leads.reduce((total, lead) => total + asNumber(lead, "potentialValueInr"), 0);
  const clientValue = clients.reduce((total, client) => total + asNumber(client, "annualValueInr"), 0);

  const filteredDocuments = useMemo(() => {
    const query = documentQuery.trim().toLowerCase();

    if (!query) {
      return documents;
    }

    return documents.filter((document) => {
      const searchable = `${document.title} ${document.type} ${document.status} ${document.owner} ${document.tags.join(
        " "
      )} ${document.body}`.toLowerCase();
      return searchable.includes(query);
    });
  }, [documentQuery, documents]);


  const executeBrainQuery = async (promptText: string) => {
    const prompt = promptText.trim();

    if (!prompt || isBrainThinking) {
      return;
    }

    const founderMessage: ChatMessage = {
      id: `founder-${Date.now()}`,
      role: "founder",
      content: prompt
    };
    const nextMessages = [...messages, founderMessage];

    setMessages(nextMessages);
    setChatInput("");
    setIsBrainThinking(true);

    try {
      const response = await fetch("/api/brain-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt,
          documents,
          messages: nextMessages,
          writeMode
        })
      });
      const payload = (await response.json()) as { answer?: string; error?: string };
      const brainMessage: ChatMessage = {
        id: `brain-${Date.now()}`,
        role: "brain",
        content: response.ok
          ? payload.answer ?? "I could not produce an answer from the current company memory."
          : payload.error ?? "The AI API could not answer right now."
      };

      setMessages((current) => [...current, brainMessage]);
    } catch {
      const brainMessage: ChatMessage = {
        id: `brain-${Date.now()}`,
        role: "brain",
        content: "The AI API is unreachable. Check the server, GEMINI_API_KEY, and network connection."
      };

      setMessages((current) => [...current, brainMessage]);
    } finally {
      setIsBrainThinking(false);
    }

    if (writeMode && /\b(update|change|edit|mark|move|set|revise)\b/i.test(prompt)) {
      const target = findTargetDocument(prompt, documents);

      if (target) {
        setChangeRequests((current) => [
          ...current,
          {
            id: `change-${Date.now()}`,
            targetDocumentId: target.id,
            title: `Update ${target.title}`,
            summary: `Waiting for authorization to execute changes parsed from: "${prompt}"`,
            status: "pending"
          }
        ]);
      }
    }
  };

  const askBrain = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await executeBrainQuery(chatInput);
  };

  const selectDocument = (document: BrainDocument) => {
    setSelectedDocumentId(document.id);
    setEditText(document.body);
    setActiveView("documents");
  };

  const saveSelectedDocument = () => {
    if (!selectedDocument) {
      return;
    }

    const updatedDocument = applyDocumentBodyUpdates(selectedDocument, editText);

    setDocuments((current) =>
      current.map((document) => (document.id === selectedDocument.id ? updatedDocument : document))
    );

    setEditText(updatedDocument.body);
  };

  const deleteDocumentById = (documentId: string) => {
    deleteDocuments([documentId]);
  };

  const addEmployee = (fields: EmployeeEditState) => {
    const id = newId("emp");
    const createdAt = todayIsoDate();
    const status = fields.status || "Active";
    const employee: BrainDocument = {
      id,
      type: "employee",
      title: `${fields.name || "New Employee"} - ${status} Employee`,
      status,
      owner: "Founder Office",
      updatedAt: createdAt,
      tags: ["employee", status, "portal-created"],
      fields: {
        ...fields,
        name: fields.name || "New Employee",
        status,
        dateOfJoining: fields.dateOfJoining || createdAt,
        monthlySalaryInr: salaryInputToNumber(fields.currentSalaryRaw || "0"),
        paymentHistory: normalizePaymentHistory(fields.paymentHistory)
      },
      body: `New employee record created from Enxt Brain on ${createdAt}.

Name: ${fields.name || "New Employee"}
Status: ${status}
Date of joining: ${fields.dateOfJoining || createdAt}
Date of leaving: Still active
Current salary: ${fields.currentSalaryRaw || "Not provided"}

Document references:
- Offer letter: Missing
- PAN card: Missing
- Aadhaar card: Missing
- Bank details: Missing

Payment records:
- No payment history recorded yet.`
    };

    setDocuments((current) => [employee, ...current]);
    setActiveView("employees");
  };

  const addProject = (fields: ProjectEditState) => {
    const id = newId("proj");
    const createdAt = todayIsoDate();
    const title = fields.title?.trim() || "New AI Project";
    const client = fields.client?.trim() || "Internal - Enxt AI";
    const progress = salaryInputToNumber(fields.progress || "0");
    const budgetInr = salaryInputToNumber(fields.budgetInr || "0");
    const project: BrainDocument = {
      id,
      type: "project",
      title,
      status: fields.phase || "Planning",
      owner: fields.owner || "Founder Office",
      updatedAt: createdAt,
      tags: ["ai-project", fields.phase || "Planning", "portal-created"],
      fields: {
        client,
        phase: fields.phase || "Planning",
        owner: fields.owner || "Founder Office",
        health: fields.health || "Green",
        priority: fields.priority || "Medium",
        dueDate: fields.dueDate || "",
        budgetInr,
        progress,
        risk: fields.risk || "Not assessed yet.",
        dataSources: fields.dataSources || ""
      },
      body: ""
    };

    project.body = buildStructuredBody(project, `Objective: ${fields.objective || "Define the project objective."}

Scope: ${fields.scope || "Add scope notes."}

Data Sources: ${fields.dataSources || "Not yet defined."}

Current status: ${fields.currentStatus || "Not yet started."}

Success metric: ${fields.successMetric || "Add measurable success criteria."}`, project.fields);

    setDocuments((current) => [project, ...current]);
    setSelectedDocumentId(project.id);
    setEditText(project.body);
    setActiveView("documents");
  };

  const addLead = (stage = "Old Leads", fields: LeadEditState = {}) => {
    const id = newId("lead");
    const createdAt = todayIsoDate();
    const company = fields.company?.trim() || "New Lead";
    const selectedStage = fields.stage || stage;
    const potentialValueInr = salaryInputToNumber(fields.potentialValueInr || fields.contractValue || "0");
    const lead: BrainDocument = {
      id,
      type: "lead",
      title: company,
      status: selectedStage,
      owner: "Founder Office",
      updatedAt: createdAt,
      tags: ["lead", selectedStage, "portal-created"],
      fields: {
        company,
        contactPerson: fields.contactPerson || "",
        projectDetails: fields.projectDetails || "",
        stage: selectedStage,
        contractValue: fields.contractValue || "",
        charge: fields.charge || "",
        paymentDue: fields.paymentDue || "",
        paymentReceived: fields.paymentReceived || "",
        paymentRemarks: fields.paymentRemarks || "",
        contractSignedStatus: fields.contractSignedStatus || "",
        communicationStatus: fields.communicationStatus || "",
        nextSteps: fields.nextSteps || "",
        deadline: fields.deadline || "",
        lastCommunicationDate: createdAt,
        potentialValueInr,
        owner: "Founder",
        source: "Portal"
      },
      body: `New lead created from Enxt Brain on ${createdAt}.

Company: ${company}
Contact Person: ${fields.contactPerson || "Not provided"}
Stage: ${selectedStage}
Contract Value: ${fields.contractValue || "Not specified"}
Potential Value INR: ${potentialValueInr}

Communication Status: ${fields.communicationStatus || "No recent updates"}
Next Steps: ${fields.nextSteps || "To be defined"}
Deadline: ${fields.deadline || "No deadline set"}
Last Communication Date: ${createdAt}`
    };

    setDocuments((current) => [lead, ...current]);
    setActiveView("crm");
  };

  const addDocument = () => {
    const id = newId("doc");
    const createdAt = todayIsoDate();
    const document: BrainDocument = {
      id,
      type: "system",
      title: "New Document",
      status: "Draft",
      owner: "Founder Office",
      updatedAt: createdAt,
      tags: ["document", "portal-created"],
      fields: {
        source: "Portal"
      },
      body: ""
    };

    document.body = buildStructuredBody(document, "New document notes.", document.fields);

    setDocuments((current) => [document, ...current]);
    setSelectedDocumentId(document.id);
    setEditText(document.body);
    setActiveView("documents");
  };

  const deleteDocuments = (documentIds: string[]) => {
    if (documentIds.length === 0) {
      return;
    }

    if (!window.confirm(`Delete ${documentIds.length} selected item${documentIds.length === 1 ? "" : "s"}?`)) {
      return;
    }

    const selectedIds = new Set(documentIds);
    const remainingDocuments = documents.filter((item) => !selectedIds.has(item.id));
    const fallbackDocument = remainingDocuments[0];

    setDocuments(remainingDocuments);

    if (selectedIds.has(selectedDocumentId)) {
      if (fallbackDocument) {
        setSelectedDocumentId(fallbackDocument.id);
        setEditText(fallbackDocument.body);
      } else {
        setSelectedDocumentId("");
        setEditText("");
      }
    }
  };

  const updateEmployee = (employeeId: string, fields: EmployeeEditState) => {
    setDocuments((current) =>
      current.map((document) => {
        if (document.id !== employeeId) {
          return document;
        }

        const monthlySalaryInr = salaryInputToNumber(fields.currentSalaryRaw as string);
        const status = (fields.status as string) || (fields.dateOfLeaving ? "Exited" : "Active");
        const updatedFields = {
          ...document.fields,
          ...fields,
          monthlySalaryInr,
          status,
          updatedStipendRaw: "",
          oldStipendRaw: "",
          offerLetterStatus: (fields.offerLetter as string ?? "").trim() ? "Available" : "Missing",
          panCardStatus: (fields.panCard as string ?? "").trim() ? "Available" : "Missing",
          aadhaarCardStatus: (fields.aadhaarCard as string ?? "").trim() ? "Available" : "Missing",
          bankDetailsStatus: (fields.bankDetails as string ?? "").trim() ? "Available" : "Missing",
          bankDetailsDisplay: (fields.bankDetails as string ?? "").trim() ? "Captured from portal - protected" : "",
          offerLetterUrl: fields.offerLetterUrl as string,
          panCardUrl: fields.panCardUrl as string,
          aadhaarCardUrl: fields.aadhaarCardUrl as string,
          bankDetailsUrl: fields.bankDetailsUrl as string,
          paymentHistory: normalizePaymentHistory(fields.paymentHistory ?? document.fields.paymentHistory)
        };

        return {
          ...document,
          title: `${fields.name || asText(document, "name")} - ${status} Employee`,
          status,
          tags: ["employee", status, "portal-editable"],
          updatedAt: new Date().toISOString().slice(0, 10),
          fields: updatedFields,
          body: buildStructuredBody(document, document.body, updatedFields)
        };
      })
    );
  };

  const updateLead = (leadId: string, fields: LeadEditState) => {
    setDocuments((current) =>
      current.map((document) => {
        if (document.id !== leadId) {
          return document;
        }

        const stage = fields.stage || asText(document, "stage") || "Old Leads";
        const potentialValueInr = salaryInputToNumber(fields.potentialValueInr || fields.contractValue);
        const updatedFields = {
          ...document.fields,
          ...fields,
          stage,
          potentialValueInr,
          interest: fields.projectDetails,
          nextAction: fields.nextSteps
        };

        return {
          ...document,
          title: fields.company || document.title,
          status: stage,
          tags: ["lead", stage, "portal-editable"],
          updatedAt: new Date().toISOString().slice(0, 10),
          fields: updatedFields,
          body: buildStructuredBody(document, document.body, updatedFields)
        };
      })
    );
  };

  const updateProject = (projectId: string, fields: ProjectEditState) => {
    setDocuments((current) =>
      current.map((document) => {
        if (document.id !== projectId) {
          return document;
        }

        const progress = salaryInputToNumber(fields.progress || "0");
        const budgetInr = salaryInputToNumber(fields.budgetInr || "0");
        const status =
          fields.status || (progress >= 100 ? "Completed" : progress > 0 ? "In Progress" : "Not Yet Started");

        const updatedFields = {
          ...document.fields,
          ...fields,
          progress,
          budgetInr,
          status
        };

        return {
          ...document,
          title: fields.title || document.title,
          status,
          tags: ["ai-project", status, "portal-editable"],
          updatedAt: new Date().toISOString().slice(0, 10),
          fields: updatedFields,
          body: buildStructuredBody(document, document.body, updatedFields)
        };
      })
    );
  };

  const applyChange = (change: ChangeRequest) => {
    const parseSimpleChange = (text: string) => {
      const m = text.match(/change\s+"([^"]+)"\s+to\s+"([^"]+)"/i);
      if (m) {
        return { from: m[1].trim(), to: m[2].trim() };
      }

      const m2 = text.match(/change\s+(.+?)\s+to\s+(.+)/i);
      if (m2) {
        return { from: cleanAiValue(m2[1]), to: cleanAiValue(m2[2]) };
      }

      return null;
    };

    const replacement = parseSimpleChange(change.summary);

    setDocuments((current) =>
      current.map((document) => {
        const isExplicitTarget = document.id === change.targetDocumentId;
        const matchesReplacementSource =
          replacement &&
          [document.title, asText(document, "name"), asText(document, "company")]
            .filter(Boolean)
            .some((value) => normalizedText(value) === normalizedText(replacement.from));

        if (!isExplicitTarget && !matchesReplacementSource) {
          return document;
        }

        const aiUpdates = parseAiChangeFields(change.summary, document);
        const fields: Record<string, BrainField> = {
          ...document.fields,
          ...aiUpdates
        };

        if (replacement) {
          if (document.type === "employee" && normalizedText(asText(document, "name")) === normalizedText(replacement.from)) {
            fields.name = replacement.to;
            aiUpdates.name = replacement.to;
          }

          if (document.type === "lead" && normalizedText(asText(document, "company")) === normalizedText(replacement.from)) {
            fields.company = replacement.to;
            aiUpdates.company = replacement.to;
          }

          if (document.type === "project" && normalizedText(document.title) === normalizedText(replacement.from)) {
            fields.title = replacement.to;
            aiUpdates.title = replacement.to;
          }
        }

        // Generic field replacement
        if (replacement) {
          for (const key in document.fields) {
            const fieldValue = String(document.fields[key]);
            if (normalizedText(fieldValue) === normalizedText(replacement.from)) {
              fields[key] = replacement.to;
              aiUpdates[key] = replacement.to;
              break; // Assume first match is enough
            }
          }
        }

        if (document.type === "employee") {
          fields.paymentHistory = normalizePaymentHistory(fields.paymentHistory);
          if (typeof fields.currentSalaryRaw === "string") {
            fields.monthlySalaryInr = salaryInputToNumber(fields.currentSalaryRaw);
            aiUpdates.monthlySalaryInr = salaryInputToNumber(fields.currentSalaryRaw);
          }
        }

        if (document.type === "lead") {
          if (typeof fields.stage === "string") {
            fields.status = fields.stage;
            aiUpdates.status = fields.stage;
          }
          if (typeof fields.potentialValueInr === "string") {
            fields.potentialValueInr = salaryInputToNumber(fields.potentialValueInr);
            aiUpdates.potentialValueInr = fields.potentialValueInr;
          }
        }

        const bodyWithReplacement =
          replacement && replacement.from
            ? document.body.replace(new RegExp(escapeRegExp(replacement.from), "gi"), replacement.to)
            : document.body;
        const bodyWithAudit = `${bodyWithReplacement}\n\nFounder-approved AI update:\n- ${change.summary}`;

        return applyDocumentBodyUpdates(
          {
            ...document,
            fields,
            status: String(fields.status ?? fields.stage ?? document.status),
            owner: String(fields.owner ?? document.owner),
            body: bodyWithAudit
          },
          bodyWithAudit,
          aiUpdates
        );
      })
    );

    setChangeRequests((current) =>
      current.map((item) => (item.id === change.id ? { ...item, status: "applied" } : item))
    );

    // Trigger an immediate sync to Firestore after an AI change — don't wait for the 1.5s debounce.
    // This ensures that if the page reloads (e.g. dev hot-reload) within the debounce window,
    // the change is already persisted to Firestore and won't be lost.
    setTimeout(() => {
      triggerSync(latestDocsRef.current);
    }, 50);
  };

  const rejectChange = (change: ChangeRequest) => {
    setChangeRequests((current) =>
      current.map((item) => (item.id === change.id ? { ...item, status: "rejected" } : item))
    );
  };

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className={`app-shell ${isSidebarOpen ? "sidebar-open" : ""}`}>
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Bot size={22} aria-hidden="true" />
          </div>
          <div>
            <p className="eyebrow">Inext AI</p>
            <h1>Enxt Brain</h1>
          </div>
        </div>

        <nav className="nav-list" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={activeView === item.id ? "nav-item active" : "nav-item"}
                key={item.id}
                onClick={() => {
                  setActiveView(item.id);
                  setIsSidebarOpen(false);
                }}
                type="button"
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-block">
          <div className="sidebar-row">
            <Database size={17} aria-hidden="true" />
            <span>{documents.length} documents</span>
          </div>
          <div className="sidebar-row">
            <ShieldCheck size={17} aria-hidden="true" />
            <span>Approval write flow</span>
          </div>
          <div
            className="sidebar-row"
            style={{
              marginTop: "4px",
              cursor: syncStatus === "error" ? "pointer" : "default"
            }}
            onClick={() => {
              if (syncStatus === "error") {
                setRetryCount(0);
                triggerSync(documents);
              }
            }}
            title={syncStatus === "error" ? "Click to retry sync now" : undefined}
          >
            {syncStatus === "syncing" && (
              <>
                <span className="sync-spinner" style={{
                  display: "inline-block",
                  width: "12px",
                  height: "12px",
                  border: "2px solid rgba(255, 255, 255, 0.2)",
                  borderTopColor: "#fff",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite"
                }} />
                <span style={{ color: "#fbbf24" }}>Syncing to Cloud...</span>
              </>
            )}
            {syncStatus === "synced" && (
              <>
                <Check size={14} style={{ color: "var(--green)" }} aria-hidden="true" />
                <span style={{ color: "var(--green)" }}>Synced to Cloud</span>
              </>
            )}
            {syncStatus === "error" && (
              <>
                <X size={14} style={{ color: "#ef4444" }} aria-hidden="true" />
                <span style={{ color: "#ef4444" }}>Sync Error (Retry)</span>
              </>
            )}
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button hamburger-menu" onClick={() => setIsSidebarOpen(!isSidebarOpen)} title="Toggle menu" type="button">
              <Menu size={18} aria-hidden="true" />
            </button>
            <div>
              <p className="eyebrow">Founder workspace</p>
              <h2>{getViewTitle(activeView)}</h2>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="search-pill">
              <Search size={16} aria-hidden="true" />
              <input
                aria-label="Search documents"
                onChange={(event) => setDocumentQuery(event.target.value)}
                placeholder="Search memory"
                value={documentQuery}
              />
            </div>
            <button className="icon-button" onClick={() => setActiveView("documents")} title="Open documents" type="button">
              <PanelLeft size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="content-grid">
          <main className="workspace" aria-live="polite">
            {activeView === "dashboard" && (
              <DashboardView
                clientValue={clientValue}
                clients={clients}
                employees={employees}
                leads={leads}
                monthlyPayroll={monthlyPayroll}
                pipelineValue={pipelineValue}
                projectBudget={projectBudget}
                projects={projects}
                selectDocument={selectDocument}
              />
            )}

            {activeView === "employees" && (
              <EmployeesView
                employees={employees}
                monthlyPayroll={monthlyPayroll}
                onAddEmployee={addEmployee}
                onDeleteDocuments={deleteDocuments}
                onUpdateEmployee={updateEmployee}
                onReloadDocuments={fetchDocuments}
              />
            )}

            {activeView === "projects" && (
              <ProjectsView
                onAddProject={addProject}
                onUpdateProject={updateProject}
                onDeleteDocuments={deleteDocuments}
                projects={projects}
                selectDocument={selectDocument}
              />
            )}

            {activeView === "crm" && (
              <CrmView
                leads={leads}
                onAddLead={addLead}
                onDeleteDocuments={deleteDocuments}
                onUpdateLead={updateLead}
              />
            )}

            {activeView === "documents" && (
              <DocumentsView
                editText={editText}
                filteredDocuments={filteredDocuments}
                onEditText={setEditText}
                onAddDocument={addDocument}
                onDeleteDocuments={deleteDocuments}
                onSave={saveSelectedDocument}
                onSelect={selectDocument}
                selectedDocument={selectedDocument}
              />
            )}
          </main>

          <aside className="brain-panel" aria-label="AI chat">
            <div className="brain-panel-header">
              <div>
                <p className="eyebrow">AI system</p>
                <h3>Founder Chat</h3>
              </div>
              <div className="brain-panel-controls">
                <label className="toggle">
                  <input checked={writeMode} onChange={(event) => setWriteMode(event.target.checked)} type="checkbox" />
                  <span>Write mode</span>
                </label>
              </div>
            </div>

            <div className="message-list">
              {messages.map((message) => (
                <div className={`message ${message.role}`} key={message.id}>
                  <p>{message.content}</p>
                </div>
              ))}
              {isBrainThinking && (
                <div className="message brain">
                  <p>Thinking with company memory...</p>
                </div>
              )}
            </div>

            <div className="suggestion-chips-container">
              <button
                className="suggestion-chip"
                onClick={() => executeBrainQuery("Calculate payroll this month")}
                disabled={isBrainThinking}
                type="button"
              >
                <span>Calculate Payroll</span>
              </button>
              <button
                className="suggestion-chip"
                onClick={() => executeBrainQuery("Show project health alerts")}
                disabled={isBrainThinking}
                type="button"
              >
                <span>Health Alerts</span>
              </button>
              <button
                className="suggestion-chip"
                onClick={() => executeBrainQuery("Identify high-value leads")}
                disabled={isBrainThinking}
                type="button"
              >
                <span>High-Value Leads</span>
              </button>
            </div>

            <form className="chat-form" onSubmit={askBrain}>
              <input
                aria-label="Ask Enxt Brain"
                disabled={isBrainThinking}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder={isBrainThinking ? "Enxt Brain is thinking" : "Ask or request a change"}
                value={chatInput}
              />
              <button className="send-button" disabled={isBrainThinking} title="Send" type="submit">
                <Send size={17} aria-hidden="true" />
              </button>
            </form>

            <div className="change-queue">
              <div className="mini-heading">
                <FilePenLine size={16} aria-hidden="true" />
                <span>AI change queue</span>
              </div>
              {changeRequests.length === 0 ? (
                <p className="empty-note">No pending edits.</p>
              ) : (
                changeRequests.slice(0, 4).map((change) => (
                  <div className={`change-item ${change.status}`} key={change.id}>
                    <strong>{change.title}</strong>
                    <p>{change.summary}</p>
                    <div className="change-actions">
                      <span>{change.status}</span>
                      {change.status === "pending" && (
                        <div>
                          <button onClick={() => applyChange(change)} title="Approve change" type="button">
                            <Check size={15} aria-hidden="true" />
                          </button>
                          <button onClick={() => rejectChange(change)} title="Reject change" type="button">
                            <X size={15} aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function DashboardView({
  employees,
  projects,
  clients,
  leads,
  monthlyPayroll,
  projectBudget,
  pipelineValue,
  clientValue,
  selectDocument
}: {
  employees: BrainDocument[];
  projects: BrainDocument[];
  clients: BrainDocument[];
  leads: BrainDocument[];
  monthlyPayroll: number;
  projectBudget: number;
  pipelineValue: number;
  clientValue: number;
  selectDocument: (document: BrainDocument) => void;
}) {
  const amberProjects = projects.filter((project) => asText(project, "health") === "Amber");
  const topLeads = [...leads].sort((a, b) => asNumber(b, "potentialValueInr") - asNumber(a, "potentialValueInr")).slice(0, 3);

  return (
    <>
      <section className="metric-grid" aria-label="Company metrics">
        <MetricCard icon={Users} label="Employees" value={`${employees.length}`} detail={`${formatCurrency(monthlyPayroll)} monthly payroll`} />
        <MetricCard icon={SquareKanban} label="AI Projects" value={`${projects.length}`} detail={`${formatCurrency(projectBudget)} scoped budget`} />
        <MetricCard icon={Building2} label="Clients" value={`${clients.length}`} detail={`${formatCurrency(clientValue)} annual value`} />
        <MetricCard icon={BadgeIndianRupee} label="Lead Pipeline" value={formatCurrency(pipelineValue)} detail={`${leads.length} open leads`} />
      </section>

      <section className="two-column">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Watchlist</p>
              <h3>Project Risk</h3>
            </div>
            <Sparkles size={18} aria-hidden="true" />
          </div>
          <div className="stack-list">
            {amberProjects.map((project) => (
              <button className="row-button" key={project.id} onClick={() => selectDocument(project)} type="button">
                <div>
                  <strong>{project.title}</strong>
                  <span>{asText(project, "risk")}</span>
                </div>
                <div className="health-container">
                  <span className={`health-pulse ${asText(project, "health").toLowerCase()}`} />
                  <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>{asText(project, "health")}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Sales</p>
              <h3>Top Open Leads</h3>
            </div>
            <BriefcaseBusiness size={18} aria-hidden="true" />
          </div>
          <div className="stack-list">
            {topLeads.map((lead) => (
              <div className="simple-row" key={lead.id}>
                <div>
                  <strong>{lead.title}</strong>
                  <span>{asText(lead, "nextAction")}</span>
                </div>
                <div className="value-chip">{formatCurrency(asNumber(lead, "potentialValueInr"))}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Operating rhythm</p>
            <h3>Founder Priority Stack</h3>
          </div>
          <MessageSquareText size={18} aria-hidden="true" />
        </div>
        <div className="priority-grid">
          <div>
            <strong>Protect quality</strong>
            <span>Invoice Intelligence, Compliance Brain, and Clinic Voice Notes need tight QA before expansion.</span>
          </div>
          <div>
            <strong>Move pipeline</strong>
            <span>Saffron Bank, Pulse Insurance, and VectorFoods need founder attention this week.</span>
          </div>
          <div>
            <strong>Harden memory</strong>
            <span>Document versioning, write approvals, and Pinecone indexing are the next architecture layer.</span>
          </div>
        </div>
      </section>
    </>
  );
}

function EmployeesView({
  employees,
  monthlyPayroll,
  onAddEmployee,
  onDeleteDocuments,
  onUpdateEmployee,
  onReloadDocuments
}: {
  employees: BrainDocument[];
  monthlyPayroll: number;
  onAddEmployee: (fields: EmployeeEditState) => void;
  onDeleteDocuments: (documentIds: string[]) => void;
  onUpdateEmployee: (employeeId: string, fields: EmployeeEditState) => void;
  onReloadDocuments: () => Promise<any>;
}) {
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [isAddingEmployee, setIsAddingEmployee] = useState(false);
  const [editFields, setEditFields] = useState<EmployeeEditState>({});
  const [viewedDocument, setViewedDocument] = useState<ViewedEmployeeDocument | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [documentFilter, setDocumentFilter] = useState("All");
  const [paymentDate, setPaymentDate] = useState(todayIsoDate());
  const [paymentSalary, setPaymentSalary] = useState("");
  const [vaultPasswordInput, setVaultPasswordInput] = useState("");
  const [isVaultAuthorized, setIsVaultAuthorized] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("vault_auth") === "true";
    }
    return false;
  });
  const editingEmployee = employees.find((employee) => employee.id === editingEmployeeId);
  const activeCount = employees.filter((employee) => asText(employee, "status") === "Active").length;
  const exitedCount = employees.filter((employee) => asText(employee, "status") === "Exited").length;
  const missingDocsCount = employees.filter((employee) => !hasCompleteEmployeeDocs(employee)).length;
  const filteredEmployees = employees
    .filter((employee) => {
      const query = employeeSearch.trim().toLowerCase();
      const employeeStatus = asText(employee, "status");
      const matchesSearch =
        !query ||
        `${asText(employee, "name")} ${asText(employee, "department")} ${asText(employee, "dateOfJoining")}`
          .toLowerCase()
          .includes(query);
      const matchesStatus = statusFilter === "All" || employeeStatus === statusFilter;
      const docsComplete = hasCompleteEmployeeDocs(employee);
      const matchesDocs =
        documentFilter === "All" ||
        (documentFilter === "Complete" && docsComplete) ||
        (documentFilter === "Missing" && !docsComplete);

      return matchesSearch && matchesStatus && matchesDocs;
    })
    .sort(
      (firstEmployee, secondEmployee) =>
        employeeStatusRank(firstEmployee) - employeeStatusRank(secondEmployee) ||
        asText(firstEmployee, "name").localeCompare(asText(secondEmployee, "name"))
    );

  const startEdit = (employee: BrainDocument) => {
    setEditingEmployeeId(employee.id);
    setEditFields({
      name: asText(employee, "name"),
      status: asText(employee, "status"),
      designation: asText(employee, "designation"),
      email: asText(employee, "email"),
      currentSalaryRaw: asText(employee, "currentSalaryRaw"),
      updatedStipendRaw: asText(employee, "updatedStipendRaw"),
      oldStipendRaw: asText(employee, "oldStipendRaw"),
      dateOfJoining: asText(employee, "dateOfJoining"),
      dateOfLeaving: asText(employee, "dateOfLeaving"),
      offerLetter: asText(employee, "offerLetter"),
      panCard: asText(employee, "panCard"),
      aadhaarCard: asText(employee, "aadhaarCard"),
      bankDetails: asText(employee, "bankDetails"),
      offerLetterUrl: asText(employee, "offerLetterUrl"),
      panCardUrl: asText(employee, "panCardUrl"),
      aadhaarCardUrl: asText(employee, "aadhaarCardUrl"),
      bankDetailsUrl: asText(employee, "bankDetailsUrl"),
      paymentHistory: (employee.fields.paymentHistory as EmployeePayment[]) ?? []
    });
    setPaymentDate(todayIsoDate());
    setPaymentSalary("");
  };

  const startAdd = () => {
    setIsAddingEmployee(true);
    setEditFields({
      name: "",
      status: "Active",
      designation: "",
      email: "",
      currentSalaryRaw: "",
      dateOfJoining: todayIsoDate(),
      dateOfLeaving: "",
      offerLetter: "",
      panCard: "",
      aadhaarCard: "",
      bankDetails: "",
      offerLetterUrl: "",
      panCardUrl: "",
      aadhaarCardUrl: "",
      bankDetailsUrl: "",
      paymentHistory: []
    });
    setPaymentDate(todayIsoDate());
    setPaymentSalary("");
  };

  const updateField = (key: string, value: string | string[] | EmployeePayment[]) => {
    setEditFields((current) => ({ ...current, [key]: value }));
  };

  const saveEdit = () => {
    if (!editingEmployeeId) {
      return;
    }

    onUpdateEmployee(editingEmployeeId, editFields);
    setEditingEmployeeId(null);
    setEditFields({});
  };

  const saveNewEmployee = () => {
    onAddEmployee(editFields);
    setIsAddingEmployee(false);
    setEditFields({});
  };

  const appendSalaryPayment = () => {
    const salary = salaryInputToNumber(paymentSalary);
    if (salary === 0) {
      alert("Cannot append a payment of zero. Please enter a valid salary amount.");
      return;
    }

    if (!paymentDate) {
      alert("Choose a payment date before appending a payment.");
      return;
    }

    const newPayment: EmployeePayment = {
      date: paymentDate,
      amount: String(salary),
      notes: `Payment made on ${paymentDate}`
    };
    updateField("paymentHistory", [newPayment, ...(editFields.paymentHistory ?? [])]);
  };

  return (
    <section className="panel fill-panel">
      <div className="employee-command">
        <div className="employee-title-block">
          <p className="eyebrow">People</p>
          <h3>Employee Registry</h3>
        </div>
        <div className="section-actions">
          <button className="secondary-button" onClick={startAdd} type="button">
            <Plus size={15} aria-hidden="true" />
            Add employee
          </button>
        </div>
        <div className="employee-kpis">
          <div>
            <span>Total</span>
            <strong>{employees.length}</strong>
          </div>
          <div>
            <span>Active</span>
            <strong>{activeCount}</strong>
          </div>
          <div>
            <span>Exited</span>
            <strong>{exitedCount}</strong>
          </div>
          <div>
            <span>Payroll</span>
            <strong>{formatCurrency(monthlyPayroll)}</strong>
          </div>
          <div>
            <span>Missing Docs</span>
            <strong>{missingDocsCount}</strong>
          </div>
        </div>
      </div>

      <div className="employee-filters" aria-label="Employee filters">
        <label className="filter-search">
          <Search size={16} aria-hidden="true" />
          <input
            aria-label="Search employees"
            onChange={(event) => setEmployeeSearch(event.target.value)}
            placeholder="Search employees"
            value={employeeSearch}
          />
        </label>
        <label className="filter-control">
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="All">All</option>
            <option value="Active">Active</option>
            <option value="Exited">Exited</option>
            <option value="On Hold">On Hold</option>
          </select>
        </label>
        <label className="filter-control">
          <span>Documents</span>
          <select value={documentFilter} onChange={(event) => setDocumentFilter(event.target.value)}>
            <option value="All">All</option>
            <option value="Complete">Complete</option>
            <option value="Missing">Missing</option>
          </select>
        </label>
        <button
          className="secondary-button"
          onClick={() => {
            setEmployeeSearch("");
            setStatusFilter("All");
            setDocumentFilter("All");
          }}
          type="button"
        >
          Reset
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Salary</th>
              <th>Payments</th>
              <th>Payment History</th>
              <th>Joined</th>
              <th>Left</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.map((employee) => (
              <tr key={employee.id}>
                <td>
                  <strong>{asText(employee, "name")}</strong>
                  <span style={{ display: "block", fontSize: "0.8rem", color: "var(--muted)", fontWeight: 500 }}>
                    {asText(employee, "designation") || "AI Engineer"} ({asText(employee, "department")})
                  </span>
                  <span style={{ display: "block", fontSize: "0.75rem", color: "var(--muted)" }}>
                    {asText(employee, "email") || `${asText(employee, "name").toLowerCase().replace(/\s+/g, "")}@inext.ai`}
                  </span>
                </td>
                <td>
                  <StatusBadge tone={asText(employee, "status") === "Exited" ? "amber" : "green"}>
                    {asText(employee, "status")}
                  </StatusBadge>
                </td>
                <td>{formatCurrency(asNumber(employee, "monthlySalaryInr"))}</td>
                <td>
                  {paymentHistoryLines(employee.fields.paymentHistory as EmployeePayment[]).length > 0 ? (
                    <>
                      <span>{formatCurrency(paymentHistoryTotalPaid(employee.fields.paymentHistory as EmployeePayment[]))}</span>
                      <small>{paymentHistoryLines(employee.fields.paymentHistory as EmployeePayment[]).length} record{paymentHistoryLines(employee.fields.paymentHistory as EmployeePayment[]).length === 1 ? "" : "s"}</small>
                    </>
                  ) : (
                    "No records"
                  )}
                </td>
                <td className="payment-history-cell">
                  <ul>
                    {paymentHistoryLines(employee.fields.paymentHistory as EmployeePayment[]).slice(0, 2).map((p, i) => (
                      <li key={i}>{p.notes}: {p.amount}</li>
                    ))}
                  </ul>
                </td>
                <td>{asText(employee, "dateOfJoining")}</td>
                <td>{presentLabel(asText(employee, "dateOfLeaving"))}</td>
                <td>
                  <button className="row-action-button" onClick={() => startEdit(employee)} type="button">
                    <Pencil size={15} aria-hidden="true" />
                    <span>Edit</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="employee-cards">
        {filteredEmployees.map((employee) => (
          <EmployeeCard key={employee.id} employee={employee} onEdit={startEdit} />
        ))}
      </div>

      {filteredEmployees.length === 0 && (
        <div className="empty-state">
          <strong>No employees match these filters.</strong>
          <span>Try clearing search or switching the status/document filter.</span>
        </div>
      )}

      {(editingEmployee || isAddingEmployee) && (
        <Portal>
          <div className="modal-backdrop" role="presentation">
            <div className="employee-edit-panel employee-edit-modal" role="dialog" aria-modal="true" aria-label={isAddingEmployee ? "Add employee" : "Edit employee"}>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">{isAddingEmployee ? "Portal add" : "Portal edit"}</p>
                  <h3>{isAddingEmployee ? "Add Employee" : `Edit ${editingEmployee ? asText(editingEmployee, "name") : "employee"}`}</h3>
                </div>
                <button className="icon-button" onClick={() => {
                  setEditingEmployeeId(null);
                  setIsAddingEmployee(false);
                }} title="Close employee form" type="button">
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              <div className="employee-edit-grid">
                <EditableField label="Name" value={editFields.name as string} onChange={(value) => updateField("name", value)} />
                <EditableField label="Designation" value={(editFields.designation ?? "") as string} onChange={(value) => updateField("designation", value)} />
                <EditableField label="Email" value={(editFields.email ?? "") as string} onChange={(value) => updateField("email", value)} />
                <label className="field-control">
                  <span>Status</span>
                  <select value={editFields.status as string} onChange={(event) => updateField("status", event.target.value)}>
                    <option value="Active">Active</option>
                    <option value="Exited">Exited</option>
                    <option value="On Hold">On Hold</option>
                  </select>
                </label>
                <EditableField label="Salary" value={editFields.currentSalaryRaw as string} onChange={(value) => updateField("currentSalaryRaw", value)} />
                <DatePickerField
                  label="Date of Joining"
                  selectedDate={editFields.dateOfJoining as string}
                  onChange={(value) => updateField("dateOfJoining", value)}
                />
                {editFields.status === "Exited" && (
                  <DatePickerField
                    label="Date of Leaving"
                    selectedDate={editFields.dateOfLeaving as string}
                    onChange={(value) => updateField("dateOfLeaving", value)}
                  />
                )}
                <EditableField label="Offer Letter" value={editFields.offerLetter as string} onChange={(value) => updateField("offerLetter", value)} />
                <EditableField label="Offer Letter URL" value={editFields.offerLetterUrl as string} onChange={(value) => updateField("offerLetterUrl", value)} />
                <EditableField label="PAN Card" value={editFields.panCard as string} onChange={(value) => updateField("panCard", value)} />
                <EditableField label="PAN Card URL" value={editFields.panCardUrl as string} onChange={(value) => updateField("panCardUrl", value)} />
                <EditableField label="Aadhaar Card" value={editFields.aadhaarCard as string} onChange={(value) => updateField("aadhaarCard", value)} />
                <EditableField label="Aadhaar Card URL" value={editFields.aadhaarCardUrl as string} onChange={(value) => updateField("aadhaarCardUrl", value)} />
                <EditableField label="Bank Details" value={editFields.bankDetails as string} onChange={(value) => updateField("bankDetails", value)} protectedValue />
                <EditableField label="Bank File URL" value={editFields.bankDetailsUrl as string} onChange={(value) => updateField("bankDetailsUrl", value)} protectedValue />
              </div>
              <div className="payment-history-editor">
                <div className="payment-history-header">
                  <h4>Payment History</h4>
                </div>
                <div>
                  <EditableField label="Salary Amount" value={paymentSalary} onChange={setPaymentSalary} />
                  <DatePickerField
                    label="Payment Date"
                    selectedDate={paymentDate}
                    onChange={setPaymentDate}
                  />
                  <button className="secondary-button" onClick={appendSalaryPayment} type="button">
                    Add Payment to Record
                  </button>
                </div>
                {(editFields.paymentHistory ?? []).length > 0 ? (
                  <div className="payment-history-grid">
                    <span>Date</span>
                    <span>Amount</span>
                    <span>Notes</span>
                    {(editFields.paymentHistory ?? []).map((payment, index) => (
                      <Fragment key={index}>
                        <p>{payment.date}</p>
                        <p>{payment.amount}</p>
                        <p>{payment.notes}</p>
                      </Fragment>
                    ))}
                  </div>
                ) : (
                  <p className="empty-note">No payment records for this employee.</p>
                )}
              </div>
              <div className="editor-footer">
                <span>Saved edits persist in this browser and update employee memory immediately.</span>
                <div className="editor-actions">
                  <button className="secondary-button" onClick={() => {
                    setEditingEmployeeId(null);
                    setIsAddingEmployee(false);
                  }} type="button">
                    Cancel
                  </button>
                  {!isAddingEmployee && editingEmployee && (
                    <button className="secondary-button danger" onClick={() => onDeleteDocuments([editingEmployee.id])} type="button">
                      <Trash2 size={15} aria-hidden="true" />
                      Delete
                    </button>
                  )}
                  <button className="primary-button" onClick={isAddingEmployee ? saveNewEmployee : saveEdit} type="button">
                    {isAddingEmployee ? "Add employee" : "Save employee"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}

      <div className="employee-doc-vault">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Extracted from sheet</p>
            <h3>Employee Document Vault</h3>
          </div>
          <FileText size={18} aria-hidden="true" />
        </div>

        {!isVaultAuthorized ? (
          <div className="vault-auth-box" style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px 20px",
            textAlign: "center",
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px dashed rgba(255, 255, 255, 0.1)",
            borderRadius: "12px",
            margin: "20px 0"
          }}>
            <Lock size={32} style={{ marginBottom: "12px", opacity: 0.6 }} />
            <h4 style={{ marginBottom: "8px", fontSize: "16px" }}>Vault is Locked</h4>
            <p style={{ fontSize: "13px", opacity: 0.7, marginBottom: "16px", maxWidth: "320px" }}>
              Please enter the portal authorization password to unlock private employee document vault.
            </p>
            <form 
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const res = await fetch("/api/documents/auth", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ password: vaultPasswordInput })
                  });
                  if (res.ok) {
                    setIsVaultAuthorized(true);
                    sessionStorage.setItem("vault_auth", "true");
                    setVaultPasswordInput("");
                    // Reload document payload from server (which will now include unmasked sensitive data)
                    await onReloadDocuments();
                  } else {
                    const data = await res.json();
                    alert(data.error || "Incorrect vault password.");
                  }
                } catch (err) {
                  console.error("Vault unlock failed:", err);
                  alert("Failed to connect to the authentication server.");
                }
              }}
              style={{ display: "flex", gap: "8px", width: "100%", maxWidth: "300px" }}
            >
              <input
                type="password"
                placeholder="Enter password..."
                value={vaultPasswordInput}
                onChange={(e) => setVaultPasswordInput(e.target.value)}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  background: "rgba(0, 0, 0, 0.2)",
                  color: "#fff",
                  fontSize: "13px"
                }}
              />
              <button 
                type="submit"
                className="primary-button"
                style={{ padding: "8px 16px", fontSize: "13px" }}
              >
                Unlock
              </button>
            </form>
          </div>
        ) : (
          <div className="document-vault-grid">
            {filteredEmployees.map((employee) => (
              <article className="doc-vault-card" key={`${employee.id}-docs`}>
                <div className="doc-vault-header">
                  <strong>{asText(employee, "name")}</strong>
                  <StatusBadge tone={asText(employee, "status") === "Exited" ? "amber" : "green"}>
                    {asText(employee, "status")}
                  </StatusBadge>
                </div>
                <DocumentReference
                  employeeId={employee.id}
                  employeeName={asText(employee, "name")}
                  label="Offer"
                  fieldKey="offerLetterUrl"
                  onView={setViewedDocument}
                  status={asText(employee, "offerLetterStatus")}
                  url={asText(employee, "offerLetterUrl")}
                  value={asText(employee, "offerLetter")}
                />
                <DocumentReference
                  employeeId={employee.id}
                  employeeName={asText(employee, "name")}
                  label="PAN"
                  fieldKey="panCardUrl"
                  onView={setViewedDocument}
                  status={asText(employee, "panCardStatus")}
                  url={asText(employee, "panCardUrl")}
                  value={asText(employee, "panCard")}
                />
                <DocumentReference
                  employeeId={employee.id}
                  employeeName={asText(employee, "name")}
                  label="Aadhaar"
                  fieldKey="aadhaarCardUrl"
                  onView={setViewedDocument}
                  status={asText(employee, "aadhaarCardStatus")}
                  url={asText(employee, "aadhaarCardUrl")}
                  value={asText(employee, "aadhaarCard")}
                />
                <DocumentReference
                  employeeId={employee.id}
                  employeeName={asText(employee, "name")}
                  label="Bank"
                  fieldKey="bankDetailsUrl"
                  onView={setViewedDocument}
                  status={asText(employee, "bankDetailsStatus")}
                  url={asText(employee, "bankDetailsUrl")}
                  value={asText(employee, "bankDetailsDisplay")}
                />
              </article>
            ))}
          </div>
        )}
      </div>

      {viewedDocument && <EmployeeDocumentViewer document={viewedDocument} onClose={() => setViewedDocument(null)} />}
    </section>
  );
}

function EditableField({
  label,
  value,
  onChange,
  protectedValue = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  protectedValue?: boolean;
}) {
  return (
    <label className="field-control">
      <span>{label}</span>
      <input
        onChange={(event) => onChange(event.target.value)}
        placeholder={protectedValue ? "Protected field" : ""}
        type="text"
        value={value ?? ""}
      />
    </label>
  );
}

function hasCompleteEmployeeDocs(employee: BrainDocument) {
  const requiredStatuses = [
    asText(employee, "panCardStatus"),
    asText(employee, "aadhaarCardStatus"),
    asText(employee, "bankDetailsStatus")
  ];

  return requiredStatuses.every((status) => status === "Available");
}

function DocumentReference({
  employeeId,
  employeeName,
  label,
  fieldKey,
  status,
  value,
  url,
  onView
}: {
  employeeId: string;
  employeeName: string;
  label: string;
  fieldKey: string;
  status: string;
  value: string;
  url: string;
  onView: (document: ViewedEmployeeDocument) => void;
}) {
  const available = status === "Available";

  // Detect if value is still an AES-CBC encrypted string (iv:encryptedHex format).
  // This happens when Firestore has stale encrypted data and decryption failed server-side
  // (e.g. key rotation). We never want to show raw hex in the vault.
  const isEncryptedHex = (v: string) =>
    typeof v === "string" && /^[0-9a-f]{32}:[0-9a-f]{32,}/i.test(v.trim());

  const cleanValue = isEncryptedHex(value) ? "" : value;

  const displayValue = available
    ? cleanValue.length > 32
      ? cleanValue.slice(0, 30) + "…"
      : cleanValue || "File on record"
    : "—";

  return (
    <div className="doc-ref-row">
      <span>{label}</span>
      <strong className={available ? "available" : "missing"}>{status || "Missing"}</strong>
      <small title={available ? value : undefined}>{displayValue}</small>
      <button
        className="doc-view-button"
        disabled={!available}
        onClick={() => onView({ employeeId, fieldKey, employeeName, label, status, value, url })}
        title={`View ${label}`}
        type="button"
      >
        <Eye size={14} aria-hidden="true" />
        <span>View</span>
      </button>
    </div>
  );
}

function EmployeeDocumentViewer({
  document,
  onClose
}: {
  document: ViewedEmployeeDocument;
  onClose: () => void;
}) {
  // Always force document preview and original URLs to go through secure API endpoint, requiring vault password authentication.
  const authToken = process.env.NEXT_PUBLIC_VAULT_PASSWORD || "inext";
  const previewUrl = `/api/documents/view?id=${document.employeeId}&field=${document.fieldKey}&preview=true&auth=${authToken}`;
  const originalUrl = `/api/documents/view?id=${document.employeeId}&field=${document.fieldKey}&auth=${authToken}`;

  return (
    <Portal>
      <div className="modal-backdrop" role="presentation">
        <section className="document-viewer" role="dialog" aria-modal="true" aria-label={`${document.label} document viewer`}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{document.employeeName}</p>
              <h3>{document.label} Document</h3>
            </div>
            <button className="icon-button" onClick={onClose} title="Close document viewer" type="button">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          {previewUrl ? (
            <div className="document-preview-frame">
              <iframe src={previewUrl} title={`${document.employeeName} ${document.label}`} />
              <a href={originalUrl} rel="noreferrer" target="_blank">
                Open original file
              </a>
            </div>
          ) : (
            <div className="document-preview-box">
              <FileText size={42} aria-hidden="true" />
              <strong>{document.value || "File on record"}</strong>
              <p>
                {document.value === "File on record" || !document.value
                  ? "This document's reference value was stored encrypted with an old/stale key and could not be decrypted. Please edit this employee to re-upload or update their document name and URL."
                  : "This record has a filename from the sheet, but no real file URL yet. Edit the employee and paste the Google Drive sharing link into the matching URL field."}
              </p>
            </div>
          )}
          <div className="document-viewer-meta">
            <span>Status</span>
            <strong>{document.status}</strong>
          </div>
        </section>
      </div>
    </Portal>
  );
}

function getPreviewUrl(url: string) {
  const trimmed = url.trim();

  if (!trimmed) {
    return "";
  }

  const driveFileMatch = trimmed.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  const googleDocMatch = trimmed.match(/docs\.google\.com\/document\/d\/([^/]+)/);
  const openFileMatch = trimmed.match(/[?&]id=([^&]+)/);
  const fileId = driveFileMatch?.[1] ?? openFileMatch?.[1];

  if (fileId) {
    return `https://drive.google.com/file/d/${fileId}/preview`;
  }

  if (googleDocMatch?.[1]) {
    return `https://docs.google.com/document/d/${googleDocMatch[1]}/preview`;
  }

  return trimmed;
}

function ProjectsView({
  onAddProject,
  onUpdateProject,
  onDeleteDocuments,
  projects,
  selectDocument
}: {
  onAddProject: (fields: ProjectEditState) => void;
  onUpdateProject: (projectId: string, fields: ProjectEditState) => void;
  onDeleteDocuments: (documentIds: string[]) => void;
  projects: BrainDocument[];
  selectDocument: (document: BrainDocument) => void;
}) {
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectFields, setProjectFields] = useState<ProjectEditState>({
    title: "",
    client: "",
    phase: "Planning",
    health: "Green",
    priority: "Medium",
    owner: "Founder Office",
    dueDate: "",
    budgetInr: "",
    progress: "0",
    risk: "",
    objective: "",
    scope: "",
    currentStatus: "",
    successMetric: "",
    dataSources: ""
  });
  const editingProject = projects.find((project) => project.id === editingProjectId);

  const updateProjectField = (key: string, value: string) => {
    setProjectFields((current) => ({ ...current, [key]: value }));
  };

  const startEdit = (project: BrainDocument) => {
    setEditingProjectId(project.id);
    setProjectFields({
      title: asText(project, "title"),
      client: asText(project, "client"),
      phase: asText(project, "phase"),
      health: asText(project, "health"),
      priority: asText(project, "priority"),
      owner: asText(project, "owner"),
      dueDate: asText(project, "dueDate"),
      budgetInr: asText(project, "budgetInr"),
      progress: asText(project, "progress"),
      risk: asText(project, "risk"),
      objective: asText(project, "objective"),
      scope: asText(project, "scope"),
      currentStatus: asText(project, "currentStatus"),
      successMetric: asText(project, "successMetric"),
      dataSources: asText(project, "dataSources")
    });
  };

  const saveProject = () => {
    if (editingProjectId) {
      onUpdateProject(editingProjectId, projectFields);
      setEditingProjectId(null);
    } else {
      onAddProject(projectFields);
    }
    setProjectFields({
      title: "",
      client: "",
      phase: "Planning",
      health: "Green",
      priority: "Medium",
      owner: "Founder Office",
      dueDate: "",
      budgetInr: "",
      progress: "0",
      risk: "",
      objective: "",
      scope: "",
      currentStatus: "",
      successMetric: "",
      dataSources: ""
    });
    setIsAddingProject(false);
  };

  return (
    <>
      <section className="panel fill-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Project docs</p>
            <h3>AI Project Register</h3>
          </div>
          <div className="section-actions">
            <button className="secondary-button" onClick={() => setIsAddingProject(true)} type="button">
              <Plus size={15} aria-hidden="true" />
              Add project
            </button>
            <SquareKanban size={18} aria-hidden="true" />
          </div>
        </div>

        <div className="project-cards">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} onSelect={selectDocument} />
          ))}
        </div>

        <div className="table-wrap project-table-wrap">
          <table className="project-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Client</th>
                <th>Status</th>
                <th>Health</th>
                <th>Owner</th>
                <th>Due</th>
                <th>Budget</th>
                <th>Progress</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => {
                const status = getProjectDeliveryStatus(project);
                const progress = asNumber(project, "progress");

                return (
                  <tr key={project.id}>
                    <td>
                      <strong>{project.title}</strong>
                      <span>{project.body.split("\n\n")[0].replace("Objective: ", "")}</span>
                    </td>
                    <td>{asText(project, "client")}</td>
                    <td>
                      <select
                        value={status}
                        onChange={(e) => onUpdateProject(project.id, { status: e.target.value })}
                        className="status-select"
                      >
                        {projectStages.map((stage) => (
                          <option key={stage} value={stage}>
                            {stage}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="health-container">
                        <span className={`health-pulse ${asText(project, "health").toLowerCase()}`} />
                        <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>{asText(project, "health")}</span>
                      </div>
                    </td>
                    <td>{asText(project, "owner")}</td>
                    <td>{asText(project, "dueDate")}</td>
                    <td>{formatCurrency(asNumber(project, "budgetInr"))}</td>
                    <td>
                      <div style={{ minWidth: "100px" }}>
                        <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>{progress}%</span>
                        <div className="progress-bar-container" aria-label={`${project.title} progress`}>
                          <div
                            className={`progress-bar-fill ${progress < 35 ? "red" : progress < 75 ? "amber" : ""}`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td>
                      <button className="row-action-button" onClick={() => selectDocument(project)} type="button">
                        <FileText size={15} aria-hidden="true" />
                        <span>Open</span>
                      </button>
                      <button className="row-action-button" onClick={() => startEdit(project)} type="button">
                        <Pencil size={15} aria-hidden="true" />
                        <span>Edit</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {(isAddingProject || editingProjectId) && (
        <Portal>
          <div className="modal-backdrop" role="presentation">
            <div className="employee-edit-panel employee-edit-modal" role="dialog" aria-modal="true" aria-label={isAddingProject ? "Add project" : "Edit project"}>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">{isAddingProject ? "Project add" : "Project edit"}</p>
                  <h3>{isAddingProject ? "Add Project" : `Edit ${projectFields.title}`}</h3>
                </div>
                <button className="icon-button" onClick={() => {
                  setIsAddingProject(false);
                  setEditingProjectId(null);
                }} title="Close project form" type="button">
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              <div className="employee-edit-grid">
                <EditableField label="Project Title" value={projectFields.title} onChange={(value) => updateProjectField("title", value)} />
                <EditableField label="Client" value={projectFields.client} onChange={(value) => updateProjectField("client", value)} />
                <EditableField label="Phase" value={projectFields.phase} onChange={(value) => updateProjectField("phase", value)} />
                <EditableField label="Health" value={projectFields.health} onChange={(value) => updateProjectField("health", value)} />
                <EditableField label="Priority" value={projectFields.priority} onChange={(value) => updateProjectField("priority", value)} />
                <EditableField label="Owner" value={projectFields.owner} onChange={(value) => updateProjectField("owner", value)} />
                <DatePickerField
                  label="Due Date"
                  selectedDate={projectFields.dueDate}
                  onChange={(value) => updateProjectField("dueDate", value)}
                />
                <EditableField label="Budget INR" value={projectFields.budgetInr} onChange={(value) => updateProjectField("budgetInr", value)} />
                <EditableField label="Progress %" value={projectFields.progress} onChange={(value) => updateProjectField("progress", value)} />
                <EditableField label="Risk" value={projectFields.risk} onChange={(value) => updateProjectField("risk", value)} />
                <EditableField label="Objective" value={projectFields.objective} onChange={(value) => updateProjectField("objective", value)} />
                <EditableField label="Scope" value={projectFields.scope} onChange={(value) => updateProjectField("scope", value)} />
                <EditableField label="Current Status" value={projectFields.currentStatus} onChange={(value) => updateProjectField("currentStatus", value)} />
                <EditableField label="Success Metric" value={projectFields.successMetric} onChange={(value) => updateProjectField("successMetric", value)} />
                <EditableField label="Data Sources" value={projectFields.dataSources} onChange={(value) => updateProjectField("dataSources", value)} />
              </div>
              <div className="editor-footer">
                <span>New project records are saved into the backend document store.</span>
                <div className="editor-actions">
                  <button className="secondary-button" onClick={() => {
                    setIsAddingProject(false);
                    setEditingProjectId(null);
                  }} type="button">
                    Cancel
                  </button>
                  <button className="primary-button" onClick={saveProject} type="button">
                    {isAddingProject ? "Save project" : "Update project"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}

function LeadPipelineProgress({ currentStage }: { currentStage: string }) {
  const stages = ["Old Leads", "Contacts", "Proposal", "Project Started", "Completed"];
  const currentIndex = stages.indexOf(currentStage);

  return (
    <div style={{ marginTop: "10px", width: "100%" }}>
      <div className="pipeline-tracker">
        {stages.map((stage, idx) => (
          <div
            key={stage}
            className={`pipeline-step ${idx <= currentIndex ? "active" : ""}`}
            title={stage}
          />
        ))}
      </div>
      <span className="pipeline-step-label">Stage: {currentStage}</span>
    </div>
  );
}

function CrmView({
  leads,
  onAddLead,
  onDeleteDocuments,
  onUpdateLead
}: {
  leads: BrainDocument[];
  onAddLead: (stage?: string, fields?: LeadEditState) => void;
  onDeleteDocuments: (documentIds: string[]) => void;
  onUpdateLead: (leadId: string, fields: LeadEditState) => void;
}) {
  const [leadSearch, setLeadSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("All");
  const [signedFilter, setSignedFilter] = useState("All");
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [expandedLeadIds, setExpandedLeadIds] = useState<string[]>([]);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [isAddingLead, setIsAddingLead] = useState(false);
  const [leadEditFields, setLeadEditFields] = useState<LeadEditState>({});
  const editingLead = leads.find((lead) => lead.id === editingLeadId);
  const totalPipeline = leads.reduce((total, lead) => total + asNumber(lead, "potentialValueInr"), 0);
  const projectStartedCount = leads.filter((lead) => asText(lead, "stage") === "Project Started").length;
  const completedCount = leads.filter((lead) => asText(lead, "stage") === "Completed").length;
  const oldLeadCount = leads.filter((lead) => asText(lead, "stage") === "Old Leads").length;
  const filteredLeads = leads.filter((lead) => {
    const query = leadSearch.trim().toLowerCase();
    const stage = asText(lead, "stage");
    const signedStatus = asText(lead, "contractSignedStatus") || "Missing";
    const searchable = `${asText(lead, "company")} ${asText(lead, "contactPerson")} ${asText(
      lead,
      "projectDetails"
    )} ${asText(lead, "communicationStatus")} ${asText(lead, "nextSteps")}`.toLowerCase();

    return (
      (!query || searchable.includes(query)) &&
      (stageFilter === "All" || stage === stageFilter) &&
      (signedFilter === "All" || signedStatus === signedFilter)
    );
  });

  const signedStatuses = Array.from(
    new Set(leads.map((lead) => asText(lead, "contractSignedStatus") || "Missing"))
  ).sort();

  const startLeadEdit = (lead: BrainDocument) => {
    setIsAddingLead(false);
    setEditingLeadId(lead.id);
    setLeadEditFields({
      company: asText(lead, "company"),
      contactPerson: asText(lead, "contactPerson"),
      projectDetails: asText(lead, "projectDetails"),
      stage: asText(lead, "stage"),
      contractValue: asText(lead, "contractValue"),
      charge: asText(lead, "charge"),
      paymentDue: asText(lead, "paymentDue"),
      paymentReceived: asText(lead, "paymentReceived"),
      paymentRemarks: asText(lead, "paymentRemarks"),
      contractSignedStatus: asText(lead, "contractSignedStatus"),
      communicationStatus: asText(lead, "communicationStatus"),
      nextSteps: asText(lead, "nextSteps"),
      deadline: asText(lead, "deadline"),
      lastCommunicationDate: asText(lead, "lastCommunicationDate"),
      potentialValueInr: asText(lead, "potentialValueInr")
    });
  };

  const updateLeadField = (key: string, value: string) => {
    setLeadEditFields((current) => ({ ...current, [key]: value }));
  };

  const startLeadAdd = (stage: string) => {
    setEditingLeadId(null);
    setIsAddingLead(true);
    setLeadEditFields({
      company: "",
      contactPerson: "",
      projectDetails: "",
      stage,
      contractValue: "",
      charge: "",
      paymentDue: "",
      paymentReceived: "",
      paymentRemarks: "",
      contractSignedStatus: "",
      communicationStatus: "",
      nextSteps: "",
      deadline: "",
      lastCommunicationDate: "",
      potentialValueInr: ""
    });
  };

  const saveLeadEdit = () => {
    if (isAddingLead) {
      onAddLead(leadEditFields.stage || "Old Leads", leadEditFields);
      setIsAddingLead(false);
      setLeadEditFields({});
      return;
    }

    if (!editingLeadId) {
      return;
    }

    onUpdateLead(editingLeadId, leadEditFields);
    setEditingLeadId(null);
    setLeadEditFields({});
  };

  const moveLeadToStage = (lead: BrainDocument, stage: string) => {
    onUpdateLead(lead.id, {
      company: asText(lead, "company"),
      contactPerson: asText(lead, "contactPerson"),
      projectDetails: asText(lead, "projectDetails"),
      stage,
      contractValue: asText(lead, "contractValue"),
      charge: asText(lead, "charge"),
      paymentDue: asText(lead, "paymentDue"),
      paymentReceived: asText(lead, "paymentReceived"),
      paymentRemarks: asText(lead, "paymentRemarks"),
      contractSignedStatus: asText(lead, "contractSignedStatus"),
      communicationStatus: asText(lead, "communicationStatus"),
      nextSteps: asText(lead, "nextSteps"),
      deadline: asText(lead, "deadline"),
      lastCommunicationDate: asText(lead, "lastCommunicationDate"),
      potentialValueInr: asText(lead, "potentialValueInr")
    });
  };

  const toggleLeadDetails = (leadId: string) => {
    setExpandedLeadIds((current) =>
      current.includes(leadId) ? current.filter((id) => id !== leadId) : [...current, leadId]
    );
  };

  return (
    <>
      <section className="panel crm-leads-panel">
        <div className="employee-command">
          <div className="employee-title-block">
            <p className="eyebrow">Pipeline</p>
            <h3>Lead Workspace</h3>
          </div>
          <div className="section-actions">
            <button className="secondary-button" onClick={() => startLeadAdd(stageFilter === "All" ? "Old Leads" : stageFilter)} type="button">
              <Plus size={15} aria-hidden="true" />
              Add lead
            </button>
          </div>
          <div className="employee-kpis">
            <div>
              <span>Total Leads</span>
              <strong>{leads.length}</strong>
            </div>
            <div>
              <span>Pipeline</span>
              <strong>{formatCurrency(totalPipeline)}</strong>
            </div>
            <div>
              <span>Started</span>
              <strong>{projectStartedCount}</strong>
            </div>
            <div>
              <span>Old Leads</span>
              <strong>{oldLeadCount}</strong>
            </div>
            <div>
              <span>Completed</span>
              <strong>{completedCount}</strong>
            </div>
          </div>
        </div>

        <div className="employee-filters" aria-label="Lead filters">
          <label className="filter-search">
            <Search size={16} aria-hidden="true" />
            <input
              aria-label="Search leads"
              onChange={(event) => setLeadSearch(event.target.value)}
              placeholder="Search company, contact, project"
              value={leadSearch}
            />
          </label>
          <label className="filter-control">
            <span>Stage</span>
            <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
              <option value="All">All</option>
              {leadStages.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-control">
            <span>Contract</span>
            <select value={signedFilter} onChange={(event) => setSignedFilter(event.target.value)}>
              <option value="All">All</option>
              {signedStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary-button"
            onClick={() => {
              setLeadSearch("");
              setStageFilter("All");
              setSignedFilter("All");
            }}
            type="button"
          >
            Reset
          </button>
        </div>

        <div className="lead-cards" aria-label="Lead grid">
          {filteredLeads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onEdit={startLeadEdit} />
          ))}
        </div>

        <section
          className="lead-board"
          aria-label="Horizontal draggable lead pipeline"
        >
          {leadStages.map((stage) => {
            const stageLeads = filteredLeads.filter((lead) => asText(lead, "stage") === stage);
            const stageValue = stageLeads.reduce((total, lead) => total + asNumber(lead, "potentialValueInr"), 0);

            return (
              <div
                className={draggedLeadId ? "lead-stage-column receiving" : "lead-stage-column"}
                key={stage}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const leadId = event.dataTransfer.getData("text/plain") || draggedLeadId;
                  const lead = leads.find((item) => item.id === leadId);

                  if (lead) {
                    moveLeadToStage(lead, stage);
                  }

                  setDraggedLeadId(null);
                }}
              >
                <div className="lead-stage-heading">
                  <div>
                    <span>{stage}</span>
                    <strong>{stageLeads.length}</strong>
                  </div>
                  <div className="lead-stage-tools">
                    <small>{stageValue ? formatCurrency(stageValue) : "No value"}</small>
                    <button onClick={() => startLeadAdd(stage)} title={`Add lead to ${stage}`} type="button">
                      <Plus size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="lead-card-stack" aria-label={`${stage} leads`}>
                  {stageLeads.map((lead) => {
                    const expanded = expandedLeadIds.includes(lead.id);

                    return (
                      <article
                        className={expanded ? "lead-card expanded" : "lead-card"}
                        draggable
                        key={lead.id}
                        onDragEnd={() => setDraggedLeadId(null)}
                        onDragStart={(event) => {
                          setDraggedLeadId(lead.id);
                          event.dataTransfer.setData("text/plain", lead.id);
                        }}
                      >
                        <div className="lead-card-top">
                          <div style={{ flex: 1 }}>
                            <h4>{asText(lead, "company")}</h4>
                            <span>{presentLabel(asText(lead, "contactPerson"))}</span>
                            <LeadPipelineProgress currentStage={asText(lead, "stage")} />
                          </div>
                          <div className="lead-card-actions">
                            <button
                              className={expanded ? "icon-button compact lead-card-toggle expanded" : "icon-button compact lead-card-toggle"}
                              onClick={() => toggleLeadDetails(lead.id)}
                              title={expanded ? "Hide lead details" : "Show lead details"}
                              type="button"
                              aria-expanded={expanded}
                            >
                              <ChevronDown size={15} aria-hidden="true" />
                            </button>
                            <button className="icon-button compact" onClick={() => startLeadEdit(lead)} title="Edit lead" type="button">
                              <Pencil size={15} aria-hidden="true" />
                            </button>
                          </div>
                        </div>

                        {expanded && (
                          <div className="lead-card-details">
                            <div className="lead-card-value">
                              <strong>
                                {asNumber(lead, "potentialValueInr")
                                  ? formatCurrency(asNumber(lead, "potentialValueInr"))
                                  : presentLabel(asText(lead, "contractValue"))}
                              </strong>
                              <span>{presentLabel(asText(lead, "contractSignedStatus"))}</span>
                            </div>

                            <div className="lead-card-section">
                              <span>Project</span>
                              <p>{presentLabel(asText(lead, "projectDetails"))}</p>
                            </div>

                            <div className="lead-card-section">
                              <span>Communication</span>
                              <p>{presentLabel(asText(lead, "communicationStatus"))}</p>
                            </div>

                            <div className="lead-card-section">
                              <span>Next Step</span>
                              <p>{presentLabel(asText(lead, "nextSteps"))}</p>
                            </div>

                            <div className="lead-card-meta">
                              <span>Due: {presentLabel(asText(lead, "deadline"))}</span>
                              <span>Last: {presentLabel(asText(lead, "lastCommunicationDate"))}</span>
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}

                  {stageLeads.length === 0 && <div className="lead-empty-drop">Drop leads here</div>}
                </div>
              </div>
            );
          })}
        </section>


        {filteredLeads.length === 0 && (
          <div className="empty-state">
            <strong>No leads match these filters.</strong>
            <span>Try another stage, signed status, or search term.</span>
          </div>
        )}
      </section>

      {(editingLeadId || isAddingLead) && (
        <Portal>
          <div className="modal-backdrop" role="presentation">
            <div className="employee-edit-panel employee-edit-modal" role="dialog" aria-modal="true" aria-label="Edit lead">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">{isAddingLead ? "Lead add" : "Lead edit"}</p>
                  <h3>{isAddingLead ? "Add Lead" : `Edit ${editingLead ? asText(editingLead, "company") : "lead"}`}</h3>
                </div>
                <button
                  className="icon-button"
                  onClick={() => {
                    setEditingLeadId(null);
                    setIsAddingLead(false);
                  }}
                  title="Close editor"
                  type="button"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              <div className="employee-edit-grid">
                <EditableField label="Company" value={leadEditFields.company} onChange={(value) => updateLeadField("company", value)} />
                <EditableField label="Contact Person" value={leadEditFields.contactPerson} onChange={(value) => updateLeadField("contactPerson", value)} />
                <EditableField label="Project Details" value={leadEditFields.projectDetails} onChange={(value) => updateLeadField("projectDetails", value)} />
                <label className="field-control">
                  <span>Stage</span>
                  <select value={leadEditFields.stage} onChange={(event) => updateLeadField("stage", event.target.value)}>
                    {leadStages.map((stage) => (
                      <option key={stage} value={stage}>
                        {stage}
                      </option>
                    ))}
                  </select>
                </label>
                <EditableField label="Contract Value" value={leadEditFields.contractValue} onChange={(value) => updateLeadField("contractValue", value)} />
                <EditableField label="Charge" value={leadEditFields.charge} onChange={(value) => updateLeadField("charge", value)} />
                <EditableField label="Payment Due" value={leadEditFields.paymentDue} onChange={(value) => updateLeadField("paymentDue", value)} />
                <EditableField label="Payment Received" value={leadEditFields.paymentReceived} onChange={(value) => updateLeadField("paymentReceived", value)} />
                <EditableField label="Contract Signed Status" value={leadEditFields.contractSignedStatus} onChange={(value) => updateLeadField("contractSignedStatus", value)} />
                <EditableField label="Communication Status" value={leadEditFields.communicationStatus} onChange={(value) => updateLeadField("communicationStatus", value)} />
                <EditableField label="Next Steps" value={leadEditFields.nextSteps} onChange={(value) => updateLeadField("nextSteps", value)} />
                <DatePickerField
                  label="Deadline"
                  selectedDate={leadEditFields.deadline}
                  onChange={(value) => updateLeadField("deadline", value)}
                />
                <DatePickerField
                  label="Last Communication"
                  selectedDate={leadEditFields.lastCommunicationDate}
                  onChange={(value) => updateLeadField("lastCommunicationDate", value)}
                />
              </div>
              <div className="editor-footer">
                <span>Saved edits persist in this browser and update the lead pipeline immediately.</span>
                <div className="editor-actions">
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setEditingLeadId(null);
                      setIsAddingLead(false);
                    }}
                    type="button"
                  >
                    Cancel
                  </button>
                  {!isAddingLead && editingLead && (
                    <button className="secondary-button danger" onClick={() => onDeleteDocuments([editingLead.id])} type="button">
                      <Trash2 size={15} aria-hidden="true" />
                      Delete
                    </button>
                  )}
                  <button className="primary-button" onClick={saveLeadEdit} type="button">
                    {isAddingLead ? "Add lead" : "Save lead"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}

function DocumentsView({
  filteredDocuments,
  selectedDocument,
  editText,
  onEditText,
  onAddDocument,
  onDeleteDocuments,
  onSave,
  onSelect
}: {
  filteredDocuments: BrainDocument[];
  selectedDocument: BrainDocument | undefined;
  editText: string;
  onEditText: (value: string) => void;
  onAddDocument: () => void;
  onDeleteDocuments: (documentIds: string[]) => void;
  onSave: () => void;
  onSelect: (document: BrainDocument) => void;
}) {
  return (
    <section className="documents-layout">
      <div className="document-list">
        <button className="document-add-button" onClick={onAddDocument} type="button">
          <Plus size={15} aria-hidden="true" />
          <span>Add document</span>
        </button>
        {filteredDocuments.map((document) => (
          <button
            className={selectedDocument?.id === document.id ? "document-item active" : "document-item"}
            key={document.id}
            onClick={() => onSelect(document)}
            type="button"
          >
            <span>{document.type}</span>
            <strong>{document.title}</strong>
            <small>{document.updatedAt}</small>
          </button>
        ))}
      </div>

      {selectedDocument ? (
        <article className="document-editor">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{selectedDocument.type}</p>
              <h3>{selectedDocument.title}</h3>
            </div>
            <div className="section-actions">
              <StatusBadge tone="neutral">{selectedDocument.status}</StatusBadge>
            </div>
          </div>
          <div className="doc-tags">
            {selectedDocument.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <textarea
            aria-label="Document body"
            onChange={(event) => onEditText(event.target.value)}
            value={editText}
            placeholder="Write notes, context, or any free-form content here…"
          />
          <div className="editor-footer">
            <span>Owner: {selectedDocument.owner}</span>
            <div className="editor-actions">
              <button className="secondary-button danger" onClick={() => onDeleteDocuments([selectedDocument.id])} type="button">
                <Trash2 size={15} aria-hidden="true" />
                Delete
              </button>
              <button className="primary-button" onClick={onSave} type="button">
                Save document
              </button>
            </div>
          </div>
        </article>
      ) : (
        <div className="document-editor" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
          <p>Select a document to edit, or click &quot;Add document&quot; to create a new one.</p>
        </div>
      )}
    </section>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="metric-card">
      <div className="metric-icon">
        <Icon size={18} aria-hidden="true" />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function StatusBadge({ children, tone }: { children: ReactNode; tone: "green" | "amber" | "neutral" }) {
  return <span className={`status-badge ${tone}`}>{children}</span>;
}

function getViewTitle(view: View) {
  switch (view) {
    case "employees":
      return "Employee Memory";
    case "projects":
      return "AI Project Docs";
    case "crm":
      return "CRM Pipeline";
    case "documents":
      return "Document Store";
    default:
      return "Command Center";
  }
}

function findTargetDocument(prompt: string, documents: BrainDocument[]) {
  const normalizedPrompt = normalizedText(prompt);
  const compactPrompt = compactText(prompt);
  const candidates = documents
    .map((document) => {
      const searchableValues = [
        document.title,
        asText(document, "name"),
        asText(document, "company"),
        asText(document, "contactPerson"),
        asText(document, "client")
      ].filter((value) => value.trim().length > 1);

      const score = searchableValues.reduce((total, value) => {
        const normalizedValue = normalizedText(value);
        const compactValue = compactText(value);

        if (!normalizedValue) {
          return total;
        }

        if (normalizedPrompt.includes(normalizedValue) || compactPrompt.includes(compactValue)) {
          return total + Math.min(100, normalizedValue.length);
        }

        const tokenMatches = normalizedValue
          .split(/\s+/)
          .filter((token) => token.length > 2 && normalizedPrompt.split(/\s+/).includes(token)).length;

        return total + tokenMatches;
      }, 0);

      return { document, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return candidates.length > 0 ? candidates[0].document : documents[0];
}
