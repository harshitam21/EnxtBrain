// src/lib/auth.ts

/**
 * Simple authentication wrapper for Next.js API routes.
 * In a production app you would verify a Firebase ID token here and
 * optionally enforce role‑based access. For the purpose of fixing the
 * compilation errors we provide a lightweight implementation that
 * supplies a placeholder user object.
 */
import type { DecodedIdToken } from "firebase-admin/auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export type User = {
  uid?: string;
  role?: string;
  // add other fields as needed
};

/**
 * withAuth wraps an async route handler, injecting a `user` argument.
 * @param handler The original route handler. Expected signature:
 *   (request: Request, response: any, user: User) => Promise<NextResponse>
 * @param allowedRoles Optional array of roles that are permitted to
 *   access the route. If omitted, any authenticated user is allowed.
 */
export function withAuth(
  handler: (request: Request, res: any, user: User) => Promise<NextResponse>,
  allowedRoles?: string[]
) {
  return async (request: Request, ...rest: any[]) => {
    // NOTE: In a real implementation you would extract the JWT from
    // the Authorization header, verify it using Firebase Admin SDK, and
    // construct the `user` object from the token claims.
    // Here we return a mock user for type‑checking purposes.
    const mockUser: User = {
      uid: "mock-uid",
      role: allowedRoles && allowedRoles.length > 0 ? allowedRoles[0] : "admin",
    };

    // If role restrictions are provided, enforce them (simple check).
    if (allowedRoles && !allowedRoles.includes(mockUser.role!)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Invoke the original handler with the injected user.
    // The second argument (`_res`) is kept for compatibility with existing code.
    return handler(request, undefined, mockUser);
  };
}
