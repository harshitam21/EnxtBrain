import { NextRequest, NextResponse } from "next/server";
import { getFirestoreClient } from "../../../../lib/firebase-admin";
import { decrypt } from "../../../../lib/encryption";
import { withAuth } from "../../../../lib/auth";

export const GET = withAuth(async (request: NextRequest, _res: any, _user) => {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const field = searchParams.get("field");

  if (!id || !field) {
    return NextResponse.json({ error: "Missing id or field parameter." }, { status: 400 });
  }

  const firestore = getFirestoreClient();
  if (!firestore) {
    return NextResponse.json({ error: "Firestore is not configured." }, { status: 503 });
  }

  try {
    const docRef = firestore.collection("brainDocuments").doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    const data = docSnap.data();
    const encryptedUrl = data?.fields?.[field];
    const realUrl = encryptedUrl ? decrypt(encryptedUrl) : undefined;

    if (!realUrl || typeof realUrl !== "string" || realUrl === "[PROTECTED]") {
      return NextResponse.json({ error: "URL not found or invalid." }, { status: 404 });
    }

    // Determine if we need to return the preview URL or original
    const previewParam = searchParams.get("preview");
    if (previewParam === "true") {
      const driveFileMatch = realUrl.match(/drive\.google\.com\/file\/d\/([^/]+)/);
      const googleDocMatch = realUrl.match(/docs\.google\.com\/document\/d\/([^/]+)/);
      const openFileMatch = realUrl.match(/[?&]id=([^&]+)/);
      const fileId = driveFileMatch?.[1] ?? openFileMatch?.[1];

      if (fileId) {
        return NextResponse.redirect(`https://drive.google.com/file/d/${fileId}/preview`);
      }
      if (googleDocMatch?.[1]) {
        return NextResponse.redirect(`https://docs.google.com/document/d/${googleDocMatch[1]}/preview`);
      }
    }

    return NextResponse.redirect(realUrl);
  } catch (error) {
    console.error("View redirect error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}, ["admin", "founder"]);
