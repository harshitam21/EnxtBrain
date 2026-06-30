// src/app/api/gemini/route.ts
import { NextResponse } from "next/server";
import { callGemini } from "../../../lib/gemini";

export const dynamic = "force-dynamic";

export const POST = async (request: Request) => {
  try {
    const { prompt } = await request.json();
    if (typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json({ error: "Prompt must be a non-empty string" }, { status: 400 });
    }
    const result = await callGemini(prompt);
    return NextResponse.json({ result }, { status: 200 });
  } catch (e: any) {
    console.error("Gemini route error:", e);
    return NextResponse.json({ error: e.message || "Unexpected error" }, { status: 502 });
  }
};
