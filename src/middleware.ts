// src/middleware.ts
// Simple in‑memory rate limiter for API routes.
// This replaces the previous Redis‑based implementation to avoid runtime issues in edge environments.

import { NextResponse } from "next/server";

// ----- Configuration -----
const LIMIT = 30; // max requests per WINDOW_SECONDS
const WINDOW_SECONDS = 60; // 1 minute

// In‑memory store: IP -> { count, resetTimestamp }
const ipStore = new Map<string, { count: number; reset: number }>();

/** Extract client IP from the request */
function getClientIp(request: Request): string {
  // Next.js Request may expose ip directly.
  // @ts-ignore – property may not exist on the built‑in type.
  const ip = (request as any).ip as string | undefined;
  if (ip) return ip;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

export async function middleware(request: Request) {
  const ip = getClientIp(request);
  const now = Date.now();
  const entry = ipStore.get(ip);

  if (!entry || now > entry.reset) {
    // Start a new window
    ipStore.set(ip, { count: 1, reset: now + WINDOW_SECONDS * 1000 });
  } else {
    entry.count++;
    if (entry.count > LIMIT) {
      const retryAfter = Math.ceil((entry.reset - now) / 1000);
      return new NextResponse(
        JSON.stringify({ error: "Too many requests, please try again later." }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": retryAfter.toString(),
          },
        }
      );
    }
  }

  // Handle CORS preflight requests
  if (request.method === "OPTIONS") {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
    return new NextResponse(null, { status: 204, headers: corsHeaders });
  }

  const response = NextResponse.next();

  // Security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Access-Control-Allow-Origin", "*"); // allow all origins for API responses

  return response;
}

// Apply middleware only to API routes
export const config = {
  matcher: "/api/:path*",
};
