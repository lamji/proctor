import crypto from "node:crypto";

import { analyzeCaptureImage } from "@/lib/ai-analyzer";
import { analyzeCodeFromComment } from "@/lib/ai-code-analyzer";

export type CommandType = "capture_now";
export type CaptureSource = "screen" | "tab" | "window" | "vscode";

export type ProctorCommand = {
  id: string;
  type: CommandType;
  createdAt: string;
};

export type CaptureRecord = {
  id: string;
  imageDataUrl: string | null;
  createdAt: string;
  source: CaptureSource;
  analysis: string;
  promptComment?: string;
  submittedCode?: string;
  completion?: string;
};

type GlobalProctorState = {
  commands: ProctorCommand[];
  captures: CaptureRecord[];
};

const MAX_CAPTURES = 20;
const globalForProctor = globalThis as typeof globalThis & {
  __PROCTOR_GLOBAL_STATE__?: GlobalProctorState;
};

const globalState: GlobalProctorState =
  globalForProctor.__PROCTOR_GLOBAL_STATE__ ??
  (globalForProctor.__PROCTOR_GLOBAL_STATE__ = {
    commands: [],
    captures: [],
  });

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

export const addGlobalCodeCompletionWithAnalysis = async ({
  promptComment,
  currentCode,
  language,
}: {
  promptComment: string;
  currentCode: string;
  language?: string;
}) => {
  const output = await analyzeCodeFromComment({
    promptComment,
    currentCode,
    language,
  });

  const capture: CaptureRecord = {
    id: crypto.randomUUID(),
    imageDataUrl: null,
    source: "vscode",
    createdAt: makeIsoNow(),
    analysis: output.analysis,
    promptComment,
    submittedCode: currentCode,
    completion: output.completion,
  };

  // VS Code flow is latest-only by request: replace previous results on each new submission.
  globalState.captures = [capture];

  return capture;
};
