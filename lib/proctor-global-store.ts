import crypto from "node:crypto";

import { analyzeCaptureImage } from "@/lib/ai-analyzer";

export type CommandType = "capture_now";
export type CaptureSource = "screen" | "tab" | "window";

export type ProctorCommand = {
  id: string;
  type: CommandType;
  createdAt: string;
};

export type CaptureRecord = {
  id: string;
  imageDataUrl: string;
  createdAt: string;
  source: CaptureSource;
  analysis: string;
};

type GlobalProctorState = {
  commands: ProctorCommand[];
  captures: CaptureRecord[];
};

const MAX_CAPTURES = 20;
const globalState: GlobalProctorState = {
  commands: [],
  captures: [],
};

const makeIsoNow = () => new Date().toISOString();

export const getGlobalStateView = () => ({
  pendingCommands: globalState.commands.length,
  captures: globalState.captures,
});

export const clearGlobalState = () => {
  globalState.commands = [];
  globalState.captures = [];

  return getGlobalStateView();
};

export const queueGlobalCommand = (type: CommandType) => {
  const command: ProctorCommand = {
    id: crypto.randomUUID(),
    type,
    createdAt: makeIsoNow(),
  };

  globalState.commands.push(command);
  return command;
};

export const pullGlobalCommand = () => {
  const command = globalState.commands.shift() ?? null;

  return {
    command,
    pendingCommands: globalState.commands.length,
  };
};

export const addGlobalCaptureWithAnalysis = async ({
  imageDataUrl,
  source,
}: {
  imageDataUrl: string;
  source: CaptureSource;
}) => {
  const analysis = await analyzeCaptureImage({ imageDataUrl, source });

  const capture: CaptureRecord = {
    id: crypto.randomUUID(),
    imageDataUrl,
    source,
    createdAt: makeIsoNow(),
    analysis,
  };

  globalState.captures.unshift(capture);
  globalState.captures = globalState.captures.slice(0, MAX_CAPTURES);

  return capture;
};
