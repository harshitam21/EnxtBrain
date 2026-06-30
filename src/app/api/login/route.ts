// src/app/api/login/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { getFirestoreClient } from "../../../lib/firebase-admin";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import jwt from "jsonwebtoken";

/**
 * Public login endpoint. Accepts a Firebase ID token (issued by client SDK) and
 * returns a signed JWT that can be used with the `withAuth` wrapper.
 * The JWT payload includes `sub` (uid) and a default role of "user".
 */
export const POST = async (request: Request) => {
  try {
    const { idToken } = await request.json();
    if (!idToken) {
      return NextResponse.json({ error: "idToken is required" }, { status: 400 });
    }

    // Verify Firebase ID token using Admin SDK
    let decoded: DecodedIdToken;
    try {
      decoded = await getAuth().verifyIdToken(idToken);
    } catch (e) {
      console.error("Firebase token verification failed", e);
      return NextResponse.json({ error: "Invalid Firebase ID token" }, { status: 401 });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "Server misconfiguration: JWT_SECRET missing" }, { status: 500 });
    }

    const token = jwt.sign(
      { sub: decoded.uid, role: "user" },
      secret,
      { expiresIn: "1h" }
    );

    return NextResponse.json({ token }, { status: 200 });
  } catch (err) {
    console.error("Login route error", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
};
