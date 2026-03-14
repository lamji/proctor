import { NextResponse } from "next/server";

import { corsPreflight, withCors } from "@/lib/proctor-cors";
import { isAuthorizedRequest } from "@/lib/proctor-env-auth";
import {
  getGlobalStateView,
  queueGlobalCommand,
  type CommandType,
} from "@/lib/proctor-global-store";
import { getRequestLogMeta, logProctorEvent } from "@/lib/proctor-logger";

export const dynamic = "force-dynamic";

export const OPTIONS = () => corsPreflight();

export const POST = async (request: Request) => {
  const reqMeta = getRequestLogMeta(request);
  if (!isAuthorizedRequest(request)) {
    logProctorEvent("warn", "command_queue_unauthorized", reqMeta);
    return withCors(
      NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 }),
    );
  }

  let body: { type?: CommandType };

  try {
    body = (await request.json()) as { type?: CommandType };
  } catch {
    logProctorEvent("warn", "command_queue_invalid_json", reqMeta);
    return withCors(
      NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 }),
    );
  }

  if (body.type !== "capture_now") {
    logProctorEvent("warn", "command_queue_invalid_type", {
      ...reqMeta,
      receivedType: body.type ?? null,
    });
    return withCors(
      NextResponse.json(
        { ok: false, error: "Unsupported command type. Use 'capture_now'." },
        { status: 400 },
      ),
    );
  }

  const command = queueGlobalCommand(body.type);
  const state = getGlobalStateView();

  logProctorEvent("info", "command_queued", {
    ...reqMeta,
    commandId: command.id,
    pendingCommands: state.pendingCommands,
  });

  return withCors(NextResponse.json({ ok: true, command }));
};
