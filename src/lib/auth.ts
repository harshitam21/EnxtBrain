// src/lib/auth.ts
import { NextResponse } from "next/server";
import jwt, { JwtPayload } from "jsonwebtoken";

export type UserRole = "admin" | "founder" | "user";
export interface AuthUser {
  id: string;
  role: UserRole;
}

/** Verify JWT from Authorization header. Returns user info or throws. */
function verifyToken(token: string): AuthUser {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET not set in environment");
  }
  const payload = jwt.verify(token, secret) as JwtPayload;
  if (!payload?.sub || !payload?.role) {
    throw new Error("Invalid token payload");
  }
  return { id: payload.sub as string, role: payload.role as UserRole };
}

/** Next.js API route wrapper that enforces authentication and optional role check. */
export function withAuth(handler: (req: any, res: any, user: AuthUser) => Promise<any>, allowedRoles: UserRole[] = ["admin", "founder"]) {
  return async (req: any, res: any) => {
    try {
      const authHeader = req.headers.get("authorization") || req.headers["authorization"];
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return NextResponse.json({ error: "Missing or malformed Authorization header" }, { status: 401 });
      }
      const token = authHeader.slice(7).trim();
      const user = verifyToken(token);
      if (!allowedRoles.includes(user.role)) {
        return NextResponse.json({ error: "Forbidden: insufficient role" }, { status: 403 });
      }
      // Pass user to handler
      return await handler(req, res, user);
    } catch (e: any) {
      console.error("Auth error:", e);
      return NextResponse.json({ error: e.message ?? "Authentication error" }, { status: 401 });
    }
  };
}
