import { NextResponse } from "next/server";

import { verifySignedRequest } from "@/lib/proctor-auth";
import { corsPreflight, withCors } from "@/lib/proctor-cors";
import { getSessionTokens, queueCommand, type CommandType } from "@/lib/proctor-store";

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
    expectedToken: sessionTokens.instructorToken,
    path: new URL(request.url).pathname,
    bodyText,
  });

  if (!verified.ok) {
    return withCors(
      NextResponse.json({ ok: false, error: verified.error }, { status: verified.status }),
    );
  }

  let body: { type?: CommandType };

  try {
    body = JSON.parse(bodyText) as { type?: CommandType };
  } catch {
    return withCors(
      NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 }),
    );
  }

  if (body.type !== "capture_now") {
    return withCors(
      NextResponse.json(
        {
          ok: false,
          error: "Unsupported command type. Use 'capture_now'.",
        },
        { status: 400 },
      ),
    );
  }

  const command = queueCommand(sessionId, body.type);
  if (!command) {
    return withCors(
      NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 }),
    );
  }

  return withCors(NextResponse.json({ ok: true, command }));
};
