// src/lib/gemini.ts
/**
 * Simple wrapper for Google Gemini API calls.
 * Uses fetch with the provided GEMINI_API_KEY.
 */
export async function callGemini(prompt: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not set in environment");
  }

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${txt}`);
  }

  return response.json();
}
