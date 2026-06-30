// src/app/api/documents/auth/route.ts
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export const dynamic = "force-dynamic";

/**
 * POST /api/documents/auth
 * Authenticates user input against server-side secret password and issues an HTTP-only cookie.
 */
export const POST = async (request: Request) => {
  try {
    const { password } = await request.json();
    const serverPassword = process.env.VAULT_PASSWORD || "inext";

    if (!password || password.trim() !== serverPassword.trim()) {
      return NextResponse.json({ success: false, error: "Incorrect password" }, { status: 401 });
    }

    const secret = process.env.JWT_SECRET || "default_jwt_vault_secret";
    // Sign a temporary token valid for vault access
    const vaultToken = jwt.sign({ scope: "vault-access" }, secret, { expiresIn: "1d" });

    const response = NextResponse.json({ success: true });
    
    // Set a secure, HTTP-only cookie
    response.cookies.set({
      name: "vault_auth_token",
      value: vaultToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24 // 1 day
    });

    return response;
  } catch (error) {
    console.error("Auth error:", error);
    return NextResponse.json({ success: false, error: "Authentication failed" }, { status: 500 });
  }
};
