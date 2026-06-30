import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const dynamic = "force-dynamic";

import type { BrainDocument, ChatMessage, EmployeePayment, DocumentType } from "../../../lib/types";
import { searchDocuments } from "../../../lib/pinecone";

type BrainChatRequest = {
  prompt?: string;
  documents?: BrainDocument[];
  messages?: ChatMessage[];
  writeMode?: boolean;
};

const fieldText = (document: BrainDocument, key: string) => String(document.fields[key] ?? "");
const fieldNumber = (document: BrainDocument, key: string) => Number(document.fields[key] ?? 0);

const compactDocument = (document: BrainDocument) => {
  if (document.type === "employee") {
    return {
      id: document.id,
      type: document.type,
      name: fieldText(document, "name"),
      status: fieldText(document, "status"),
      currentSalaryRaw: fieldText(document, "currentSalaryRaw"),
      monthlySalaryInr: fieldNumber(document, "monthlySalaryInr"),
      dateOfJoining: fieldText(document, "dateOfJoining"),
      dateOfLeaving: fieldText(document, "dateOfLeaving"),
      panCardStatus: fieldText(document, "panCardStatus"),
      aadhaarCardStatus: fieldText(document, "aadhaarCardStatus"),
      bankDetailsStatus: fieldText(document, "bankDetailsStatus"),
      paymentHistory: document.fields.paymentHistory as EmployeePayment[] | undefined
    };
  }

  if (document.type === "lead") {
    return {
      id: document.id,
      type: document.type,
      company: fieldText(document, "company"),
      contactPerson: fieldText(document, "contactPerson"),
      stage: fieldText(document, "stage"),
      projectDetails: fieldText(document, "projectDetails"),
      contractValue: fieldText(document, "contractValue"),
      potentialValueInr: fieldNumber(document, "potentialValueInr"),
      communicationStatus: fieldText(document, "communicationStatus"),
      nextSteps: fieldText(document, "nextSteps"),
      deadline: fieldText(document, "deadline"),
      lastCommunicationDate: fieldText(document, "lastCommunicationDate")
    };
  }

  if (document.type === "project") {
    return {
      id: document.id,
      type: document.type,
      title: document.title,
      status: document.status,
      owner: document.owner,
      health: fieldText(document, "health"),
      risk: fieldText(document, "risk"),
      progress: fieldNumber(document, "progress"),
      dueDate: fieldText(document, "dueDate"),
      budgetInr: fieldNumber(document, "budgetInr")
    };
  }

  return {
    id: document.id,
    type: document.type,
    title: document.title,
    status: document.status,
    owner: document.owner,
    updatedAt: document.updatedAt,
    fields: document.fields
  };
};

const extractGeminiText = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const response = payload as {
    candidates?: Array<{
      finishReason?: string;
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  return (
    response.candidates
      ?.flatMap((candidate) => candidate.content?.parts ?? [])
      .map((item) => item.text ?? "")
      .filter(Boolean)
      .join("\n") ?? ""
  );
};

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Gemini API key is missing. Add GEMINI_API_KEY to .env.local, restart the server, and ask Enxt Brain again."
      },
      { status: 500 }
    );
  }

  const body = (await request.json()) as BrainChatRequest;
  const prompt = body.prompt?.trim();
  const documents = body.documents ?? [];

  // Prefer an explicit RAG model, fall back to configured Gemini model, then default.
  const mainModel = process.env.RAG_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const fallbackModel = process.env.FALLBACK_RAG_MODEL || "gemini-2.5-flash";

  // Check if it is high traffic hours: Mon-Fri, 9:00 AM to 6:00 PM
  const isHighTrafficHours = (): boolean => {
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday, 6 = Saturday
    const hour = now.getHours(); // 0 to 23 (local time)
    return day >= 1 && day <= 5 && hour >= 9 && hour < 18;
  };

  const rawModel = isHighTrafficHours() ? fallbackModel : mainModel;
  console.log(`[RAG Model] Selected model: ${rawModel}`);

  // Some Gemini variants (like "-lite") are not supported by the v1beta generateContent
  // endpoint. Map common "lite" names to their full counterparts as a safe fallback.
  const sanitizeModelForGenerateContent = (m: string) => {
    if (!m) return m;
    // If the model name contains 'lite' (e.g. gemini-3.5-flash-lite), prefer the non-lite variant
    // which is typically supported for generateContent.
    if (/\b(lite)\b/i.test(m)) {
      return m.replace(/-?lite\b/i, "");
    }
    return m;
  };

  const model = sanitizeModelForGenerateContent(rawModel);

  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
  }

  const isLongListRequest = /\b(all|list|show|export|contacts?|everyone|complete)\b/i.test(prompt);
  let relevantDocs = documents;

  if (!isLongListRequest) {
    try {
      const matches = await searchDocuments(prompt, 12);
      const matchIds = new Set(matches.map((m) => m.id));
      relevantDocs = documents.filter((doc) => matchIds.has(doc.id));

      if (relevantDocs.length === 0 && matches.length > 0) {
        relevantDocs = matches.map((m) => ({
          id: m.id,
          type: m.type as DocumentType,
          title: m.title,
          status: m.status,
          owner: m.owner,
          tags: m.tags.split(", "),
          body: m.body,
          fields: {},
          updatedAt: m.updatedAt
        }));
      }
    } catch (err) {
      console.error("Pinecone search failed, falling back to full memory:", err);
    }
  }

  const companyMemory = relevantDocs.map(compactDocument);
  const recentMessages = (body.messages ?? []).slice(-8).map((message) => ({
    role: message.role,
    content: message.content
  }));
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelInstance = genAI.getGenerativeModel({
      model: model,
      systemInstruction: "You are Enxt Brain, the private AI company brain for Inext AI's founder. Answer only from the provided company memory. Be direct, operational, and specific. When asked for lists, compute from the JSON fields and return the complete list. For CRM contact lists, format each item as `Name - Company - Stage`, one item per line, with no extra commentary after the list. For employee salary questions, use monthlySalaryInr and format each result as `Name - salary INR - status`, one employee per line. Do not use tables. Do not add unfinished parentheses. If there are no matches, say so clearly. If the founder asks to edit, move, or update records, explain the intended change clearly and ask for approval unless the portal has already provided an explicit update action. Never invent employees, salaries, leads, clients, or project facts that are not in memory."
    });

    const result = await modelInstance.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: JSON.stringify({
                founderQuestion: prompt,
                writeMode: Boolean(body.writeMode),
                recentMessages,
                companyMemory
              })
            }
          ]
        }
      ],
      generationConfig: {
        maxOutputTokens: isLongListRequest ? 8192 : 2048,
        temperature: 0.2,
        ...(model.includes("pro") ? {
          // @ts-ignore
          thinkingConfig: {
            thinkingLevel: isLongListRequest ? "minimal" : "low"
          }
        } : {})
      }
    });

    const response = result.response;
    const answer = response.text()?.trim() || "";

    // Attempt to access candidate finishReason if present
    // @ts-ignore
    const finishReason = response.candidates?.[0]?.finishReason;

    return NextResponse.json({
      answer:
        finishReason === "MAX_TOKENS"
          ? `${answer}\n\nThe model stopped because it hit the output limit. Ask me to continue if you need the rest.`
          : answer || "I could not produce an answer from the current company memory."
    });
  } catch (error: any) {
    console.error("Gemini SDK request error:", error);
    return NextResponse.json(
      {
        error:
          error?.message ??
          "Gemini could not answer right now. Check your API key, model access, and server logs."
      },
      { status: 500 }
    );
  }
}
