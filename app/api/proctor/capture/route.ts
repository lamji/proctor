import { NextResponse } from "next/server";

import { corsPreflight, withCors } from "@/lib/proctor-cors";
import { isAuthorizedRequest } from "@/lib/proctor-env-auth";
import {
  addGlobalCaptureWithAnalysis,
  getGlobalStateView,
  type CaptureSource,
} from "@/lib/proctor-global-store";
import { getRequestLogMeta, logProctorEvent } from "@/lib/proctor-logger";

export const dynamic = "force-dynamic";

export const OPTIONS = () => corsPreflight();

export const POST = async (request: Request) => {
  const reqMeta = getRequestLogMeta(request);
  if (!isAuthorizedRequest(request)) {
    logProctorEvent("warn", "capture_unauthorized", reqMeta);
    return withCors(
      NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 }),
    );
  }

  let body: { imageDataUrl?: string; source?: CaptureSource };

  try {
    body = (await request.json()) as { imageDataUrl?: string; source?: CaptureSource };
  } catch {
    logProctorEvent("warn", "capture_invalid_json", reqMeta);
    return withCors(
      NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 }),
    );
  }

  if (!body.imageDataUrl || !body.imageDataUrl.startsWith("data:image/")) {
    logProctorEvent("warn", "capture_invalid_image_data", reqMeta);
    return withCors(
      NextResponse.json(
        { ok: false, error: "imageDataUrl must be a valid data URL." },
        { status: 400 },
      ),
    );
  }

  const source: CaptureSource = body.source ?? "tab";
  const approxKb = Math.round((body.imageDataUrl.length * 0.75) / 1024);
  const startedAt = Date.now();
  const capture = await addGlobalCaptureWithAnalysis({
    imageDataUrl: body.imageDataUrl,
    source,
  });
  const state = getGlobalStateView();

  logProctorEvent("info", "capture_uploaded", {
    ...reqMeta,
    captureId: capture.id,
    source,
    approxKb,
    processingMs: Date.now() - startedAt,
    analysisChars: capture.analysis.length,
    captureCount: state.captures.length,
    pendingCommands: state.pendingCommands,
  });

  return withCors(NextResponse.json({ ok: true, capture }));
};
