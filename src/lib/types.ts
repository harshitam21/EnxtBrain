export type DocumentType = "employee" | "project" | "client" | "lead" | "system";

export type EmployeePayment = {
  date: string;
  amount: string;
  notes: string;
};

export type BrainField = string | number | string[] | EmployeePayment[];

export type BrainDocument = {
  id: string;
  type: DocumentType;
  title: string;
  status: string;
  owner: string;
  updatedAt: string;
  tags: string[];
  fields: Record<string, BrainField>;
  body: string;
};

export type ChatMessage = {
  id: string;
  role: "founder" | "brain";
  content: string;
};

export type ChangeRequest = {
  id: string;
  targetDocumentId: string;
  title: string;
  summary: string;
  status: "pending" | "applied" | "rejected";
};
