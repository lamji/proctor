import { NextResponse } from "next/server";

import { corsPreflight, withCors } from "@/lib/proctor-cors";
import { isAuthorizedRequest } from "@/lib/proctor-env-auth";
import { pullGlobalCommand } from "@/lib/proctor-global-store";
import { getRequestLogMeta, logProctorEvent } from "@/lib/proctor-logger";

export const dynamic = "force-dynamic";

export const OPTIONS = () => corsPreflight();

export const GET = async (request: Request) => {
  const reqMeta = getRequestLogMeta(request);
  if (!isAuthorizedRequest(request)) {
    logProctorEvent("warn", "command_pull_unauthorized", reqMeta);
    return withCors(
      NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 }),
    );
  }

  const pullResult = pullGlobalCommand();

  logProctorEvent("info", "command_pulled", {
    ...reqMeta,
    hasCommand: Boolean(pullResult.command),
    commandId: pullResult.command?.id ?? null,
    pendingCommands: pullResult.pendingCommands,
  });

  return withCors(NextResponse.json({ ok: true, ...pullResult }));
};
