import { NextResponse } from "next/server";

import { verifySignedRequest } from "@/lib/proctor-auth";
import { corsPreflight, withCors } from "@/lib/proctor-cors";
import {
  addCaptureWithAnalysis,
  getSessionTokens,
  type CaptureSource,
} from "@/lib/proctor-store";

export const dynamic = "force-dynamic";

export const OPTIONS = () => corsPreflight();

export const POST = async (
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) => {
  const { sessionId } = await params;
  const sessionTokens = getSessionTokens(sessionId);
  if (!sessionTokens) {
    return withCors(
      NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 }),
    );
  }

  const bodyText = await request.text();
  const verified = verifySignedRequest({
    request,
    expectedToken: sessionTokens.extensionToken,
    path: new URL(request.url).pathname,
    bodyText,
  });

  if (!verified.ok) {
    return withCors(
      NextResponse.json({ ok: false, error: verified.error }, { status: verified.status }),
    );
  }

  let body: { imageDataUrl?: string; source?: CaptureSource };

  try {
    body = JSON.parse(bodyText) as { imageDataUrl?: string; source?: CaptureSource };
  } catch {
    return withCors(
      NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 }),
    );
  }

  if (!body.imageDataUrl || !body.imageDataUrl.startsWith("data:image/")) {
    return withCors(
      NextResponse.json(
        { ok: false, error: "imageDataUrl must be a valid data URL." },
        { status: 400 },
      ),
    );
  }

  const source: CaptureSource = body.source ?? "screen";
  const capture = await addCaptureWithAnalysis({
    sessionId,
    imageDataUrl: body.imageDataUrl,
    source,
  });
  if (!capture) {
    return withCors(
      NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 }),
    );
  }

  return withCors(NextResponse.json({ ok: true, capture }));
};
