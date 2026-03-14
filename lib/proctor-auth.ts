import crypto from "node:crypto";

const HEADER_TIMESTAMP = "x-proctor-ts";
const HEADER_SIGNATURE = "x-proctor-signature";
const MAX_SKEW_MS = 60_000;

const sha256Hex = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

const hmacHex = (secret: string, value: string) =>
  crypto.createHmac("sha256", secret).update(value).digest("hex");

const normalizeBearer = (value: string | null) => {
  if (!value) {
    return null;
  }

  return value.replace(/^Bearer\s+/i, "").trim();
};

type SignatureInput = {
  method: string;
  path: string;
  timestampMs: string;
  bodyText: string;
  token: string;
};

const buildSignature = ({ method, path, timestampMs, bodyText, token }: SignatureInput) => {
  const canonical = `${method.toUpperCase()}:${path}:${timestampMs}:${sha256Hex(bodyText)}`;
  return hmacHex(token, canonical);
};

export const verifySignedRequest = ({
  request,
  expectedToken,
  path,
  bodyText,
}: {
  request: Request;
  expectedToken: string;
  path: string;
  bodyText: string;
}) => {
  const bearer = normalizeBearer(request.headers.get("authorization"));
  if (!bearer || bearer !== expectedToken) {
    return { ok: false as const, status: 401, error: "Unauthorized token." };
  }

  const timestampMs = request.headers.get(HEADER_TIMESTAMP);
  if (!timestampMs) {
    return { ok: false as const, status: 401, error: `Missing header: ${HEADER_TIMESTAMP}.` };
  }

  const numericTimestamp = Number(timestampMs);
  if (!Number.isFinite(numericTimestamp)) {
    return { ok: false as const, status: 401, error: "Invalid signature timestamp." };
  }

  const skew = Math.abs(Date.now() - numericTimestamp);
  if (skew > MAX_SKEW_MS) {
    return { ok: false as const, status: 401, error: "Expired signature timestamp." };
  }

  const signature = request.headers.get(HEADER_SIGNATURE);
  if (!signature) {
    return { ok: false as const, status: 401, error: `Missing header: ${HEADER_SIGNATURE}.` };
  }

  const expectedSignature = buildSignature({
    method: request.method,
    path,
    timestampMs,
    bodyText,
    token: expectedToken,
  });

  const received = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (received.length !== expected.length) {
    return { ok: false as const, status: 401, error: "Invalid request signature." };
  }

  if (!crypto.timingSafeEqual(received, expected)) {
    return { ok: false as const, status: 401, error: "Invalid request signature." };
  }

  return { ok: true as const };
};
