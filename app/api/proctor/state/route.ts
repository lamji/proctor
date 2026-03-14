import { NextResponse } from "next/server";

import { corsPreflight, withCors } from "@/lib/proctor-cors";
import { isAuthorizedRequest } from "@/lib/proctor-env-auth";
import { clearGlobalState, getGlobalStateView } from "@/lib/proctor-global-store";
import { getRequestLogMeta, logProctorEvent } from "@/lib/proctor-logger";

export const dynamic = "force-dynamic";

export const OPTIONS = () => corsPreflight();

export const GET = async (request: Request) => {
  const reqMeta = getRequestLogMeta(request);
  if (!isAuthorizedRequest(request)) {
    logProctorEvent("warn", "state_unauthorized", reqMeta);
    return withCors(
      NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 }),
    );
  }

  const state = getGlobalStateView();

  logProctorEvent("info", "state_read", {
    ...reqMeta,
    pendingCommands: state.pendingCommands,
    captureCount: state.captures.length,
  });

  return withCors(NextResponse.json({ ok: true, state }));
};

export const DELETE = async (request: Request) => {
  const reqMeta = getRequestLogMeta(request);
  if (!isAuthorizedRequest(request)) {
    logProctorEvent("warn", "state_clear_unauthorized", reqMeta);
    return withCors(
      NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 }),
    );
  }

  const state = clearGlobalState();
  logProctorEvent("info", "state_cleared", {
    ...reqMeta,
    pendingCommands: state.pendingCommands,
    captureCount: state.captures.length,
  });

  return withCors(NextResponse.json({ ok: true, state }));
};
