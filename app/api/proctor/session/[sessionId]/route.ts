import { NextResponse } from "next/server";

import { corsPreflight, withCors } from "@/lib/proctor-cors";
import { getSessionView } from "@/lib/proctor-store";

export const dynamic = "force-dynamic";

export const OPTIONS = () => corsPreflight();

export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) => {
  const { sessionId } = await params;
  const session = getSessionView(sessionId);

  if (!session) {
    return withCors(
      NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 }),
    );
  }

  return withCors(NextResponse.json({ ok: true, session }));
};
