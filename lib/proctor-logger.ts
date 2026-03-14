type ProctorLogLevel = "info" | "warn" | "error";

type ProctorLogDetails = Record<string, unknown>;

const isLoggingEnabled = () => process.env.PROCTOR_DEBUG_LOGS !== "false";

const serializeLog = (payload: ProctorLogDetails) => {
  try {
    return JSON.stringify(payload);
  } catch {
    return JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      event: "log_serialize_failed",
    });
  }
};

export const getRequestLogMeta = (request: Request) => {
  const url = new URL(request.url);
  const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
  const ip = forwardedFor.split(",")[0]?.trim() || "unknown";
  const ua = request.headers.get("user-agent") || "unknown";

  return {
    method: request.method,
    path: url.pathname,
    ip,
    ua: ua.slice(0, 160),
  };
};

export const logProctorEvent = (
  level: ProctorLogLevel,
  event: string,
  details: ProctorLogDetails = {},
) => {
  if (!isLoggingEnabled()) {
    return;
  }

  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...details,
  };

  const line = `[PROCTOR] ${serializeLog(payload)}`;

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.info(line);
};
