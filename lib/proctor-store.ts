import crypto from "node:crypto";

import { analyzeCaptureImage } from "@/lib/ai-analyzer";

export type CommandType = "capture_now";

export type ProctorCommand = {
  id: string;
  type: CommandType;
  createdAt: string;
};

export type CaptureSource = "screen" | "tab" | "window";

export type CaptureRecord = {
  id: string;
  imageDataUrl: string;
  createdAt: string;
  source: CaptureSource;
  analysis: string;
};

type ProctorSession = {
  id: string;
  createdAt: string;
  instructorToken: string;
  extensionToken: string;
  commands: ProctorCommand[];
  captures: CaptureRecord[];
};

const MAX_CAPTURES_PER_SESSION = 20;
const sessionStore = new Map<string, ProctorSession>();

const makeIsoNow = () => new Date().toISOString();

const makeSessionView = (session: ProctorSession) => ({
  sessionId: session.id,
  createdAt: session.createdAt,
  pendingCommands: session.commands.length,
  captures: session.captures,
});

export const createSession = () => {
  const sessionId = crypto.randomUUID();
  const instructorToken = crypto.randomBytes(32).toString("hex");
  const extensionToken = crypto.randomBytes(32).toString("hex");

  const session: ProctorSession = {
    id: sessionId,
    createdAt: makeIsoNow(),
    instructorToken,
    extensionToken,
    commands: [],
    captures: [],
  };

  sessionStore.set(sessionId, session);
  return {
    session: makeSessionView(session),
    credentials: {
      instructorToken,
      extensionToken,
    },
  };
};

export const getSessionView = (sessionId: string) => {
  const session = sessionStore.get(sessionId);
  if (!session) {
    return null;
  }

  return makeSessionView(session);
};

export const queueCommand = (sessionId: string, commandType: CommandType) => {
  const session = sessionStore.get(sessionId);
  if (!session) {
    return null;
  }

  const command: ProctorCommand = {
    id: crypto.randomUUID(),
    type: commandType,
    createdAt: makeIsoNow(),
  };

  session.commands.push(command);
  return command;
};

export const getSessionTokens = (sessionId: string) => {
  const session = sessionStore.get(sessionId);
  if (!session) {
    return null;
  }

  return {
    instructorToken: session.instructorToken,
    extensionToken: session.extensionToken,
  };
};

export const pullNextCommand = (sessionId: string) => {
  const session = sessionStore.get(sessionId);
  if (!session) {
    return null;
  }

  const command = session.commands.shift() ?? null;

  return {
    command,
    pendingCommands: session.commands.length,
  };
};

const getSessionForCapture = (sessionId: string) => {
  const session = sessionStore.get(sessionId);
  if (!session) {
    return null;
  }
  return session;
};

export const addCaptureWithAnalysis = async ({
  sessionId,
  imageDataUrl,
  source,
}: {
  sessionId: string;
  imageDataUrl: string;
  source: CaptureSource;
}) => {
  const session = getSessionForCapture(sessionId);
  if (!session) {
    return null;
  }

  const analysis = await analyzeCaptureImage({
    imageDataUrl,
    source,
  });

  const capture: CaptureRecord = {
    id: crypto.randomUUID(),
    imageDataUrl,
    source,
    createdAt: makeIsoNow(),
    analysis,
  };

  session.captures.unshift(capture);
  session.captures = session.captures.slice(0, MAX_CAPTURES_PER_SESSION);

  return capture;
};
