import { NextResponse } from "next/server";

import { verifySignedRequest } from "@/lib/proctor-auth";
import { corsPreflight, withCors } from "@/lib/proctor-cors";
import { getSessionTokens, pullNextCommand } from "@/lib/proctor-store";

export const dynamic = "force-dynamic";

export const OPTIONS = () => corsPreflight();

export const GET = async (
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

  const verified = verifySignedRequest({
    request,
    expectedToken: sessionTokens.extensionToken,
    path: new URL(request.url).pathname,
    bodyText: "",
  });

  if (!verified.ok) {
    return withCors(
      NextResponse.json({ ok: false, error: verified.error }, { status: verified.status }),
    );
  }

  const pullResult = pullNextCommand(sessionId);
  if (!pullResult) {
    return withCors(
      NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 }),
    );
  }

  return withCors(NextResponse.json({ ok: true, ...pullResult }));
};
