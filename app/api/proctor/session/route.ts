import { NextResponse } from "next/server";

import { corsPreflight, withCors } from "@/lib/proctor-cors";
import { createSession } from "@/lib/proctor-store";

export const dynamic = "force-dynamic";

export const OPTIONS = () => corsPreflight();

export const POST = async () => {
  const { session, credentials } = createSession();

  return withCors(NextResponse.json({ ok: true, session, credentials }));
};
