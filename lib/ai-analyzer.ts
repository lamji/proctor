import type { CaptureSource } from "@/lib/proctor-global-store";
import { logProctorEvent } from "@/lib/proctor-logger";
import { getTechKnowledgeContext, shouldIncludeTechKnowledge } from "@/lib/groq-knowledge";

type AnalyzeCaptureInput = {
  imageDataUrl: string;
  source: CaptureSource;
};

const DEFAULT_MAX_OUTPUT_TOKENS = 900;

const resolveMaxOutputTokens = () => {
  const rawMaxTokens = Number.parseInt(process.env.PROCTOR_AI_MAX_OUTPUT_TOKENS ?? "", 10);
  if (!Number.isFinite(rawMaxTokens) || rawMaxTokens <= 0) {
    return DEFAULT_MAX_OUTPUT_TOKENS;
  }

  return Math.min(rawMaxTokens, 4000);
};

const extractResponseText = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const root = payload as {
    content?: Array<{ type?: string; text?: string }>;
  };

  const text = root.content
    ?.filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text?.trim())
    .filter((t): t is string => Boolean(t))
    .join("\n\n");

  return text || null;
};

const analyzeWithAnthropic = async ({ imageDataUrl, source }: AnalyzeCaptureInput) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }

  const model = process.env.ANTHROPIC_VISION_MODEL ?? "claude-haiku-4-5-20251001";
  const mode = process.env.PROCTOR_AI_MODE ?? "proctor";

  const defaultProctorPrompt = [
    "You are an exam proctor assistant.",
    "Analyze only what is visible in the screenshot.",
    "Focus on potential cheating signals, especially for coding exams:",
    "- Presence of AI/chat assistant websites or tools.",
    "- Solution websites, forums, or copied answer sources.",
    "- Multiple windows/tabs that suggest external help.",
    "- Mismatch between exam screen and active content.",
    "Output format:",
    "1) Summary (1-2 sentences).",
    "2) Suspicion level: low/medium/high.",
    "3) Evidence bullets from the image only.",
    "Keep response concise (<=120 words).",
  ].join(" ");

  const defaultSolvePrompt = [
    "Testing mode only.",
    "If the screenshot includes a coding/problem-solving question, solve it completely.",
    "Return markdown.",
    "If code is present, wrap it in fenced triple backticks with a language hint when known.",
    "For multiple-choice questions, evaluate each visible option as TRUE/FALSE with one short reason before the final answer.",
    "Do not guess hidden/unclear text. If any option text is unreadable, explicitly state which part is unclear.",
    "Prefer correctness over brevity.",
    "Use this structure:",
    "Problem:",
    "Option Check:",
    "- Option 1: True/False - reason",
    "- Option 2: True/False - reason",
    "Final Answer:",
    "Code:",
    "Why It Works:",
    "If no solvable problem is visible, say: 'No solvable problem detected in screenshot.'",
  ].join(" ");

  const customGeneralPrompt = process.env.PROCTOR_AI_PROMPT?.trim();
  const customSolvePrompt = process.env.PROCTOR_AI_SOLVE_PROMPT?.trim();
  const customProctorPrompt = process.env.PROCTOR_AI_PROCTOR_PROMPT?.trim();

  const prompt =
    mode === "solve_test"
      ? (customSolvePrompt || defaultSolvePrompt)
      : (customProctorPrompt || customGeneralPrompt || defaultProctorPrompt);

  const techKnowledgeContext =
    mode === "solve_test" && shouldIncludeTechKnowledge() ? getTechKnowledgeContext() : "";
  const promptWithKnowledge = techKnowledgeContext ? `${prompt}\n\n${techKnowledgeContext}` : prompt;

  const dataUrlMatch = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  const mediaType = (dataUrlMatch?.[1] ?? "image/png") as "image/png" | "image/jpeg" | "image/gif" | "image/webp";
  const imageData = dataUrlMatch?.[2] ?? imageDataUrl;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: resolveMaxOutputTokens(),
      system: promptWithKnowledge,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `Capture source: ${source}.` },
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageData } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Anthropic analysis failed (${response.status}): ${details}`);
  }

  const payload = (await response.json()) as unknown;
  return extractResponseText(payload);
};

const analyzeWithWebhook = async ({ imageDataUrl, source }: AnalyzeCaptureInput) => {
  const endpoint = process.env.AI_ANALYSIS_ENDPOINT;
  if (!endpoint) {
    return null;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.AI_ANALYSIS_BEARER_TOKEN
        ? { Authorization: `Bearer ${process.env.AI_ANALYSIS_BEARER_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({
      imageDataUrl,
      source,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`AI webhook failed (${response.status}): ${details}`);
  }

  const payload = (await response.json()) as {
    analysis?: string;
  };

  return payload.analysis?.trim() || null;
};

const fallbackAnalysis = ({ imageDataUrl, source }: AnalyzeCaptureInput) => {
  const kbEstimate = Math.round((imageDataUrl.length * 0.75) / 1024);
  return [
    `Capture received from ${source}.`,
    `Approx encoded size: ${kbEstimate} KB.`,
    "No AI provider configured. Set ANTHROPIC_API_KEY or AI_ANALYSIS_ENDPOINT.",
  ].join(" ");
};

export const analyzeCaptureImage = async (input: AnalyzeCaptureInput) => {
  const startedAt = Date.now();

  try {
    const anthropicOutput = await analyzeWithAnthropic(input);
    if (anthropicOutput) {
      logProctorEvent("info", "ai_analysis_complete", {
        provider: "anthropic",
        source: input.source,
        outputChars: anthropicOutput.length,
        processingMs: Date.now() - startedAt,
      });
      return anthropicOutput;
    }

    const webhookOutput = await analyzeWithWebhook(input);
    if (webhookOutput) {
      logProctorEvent("info", "ai_analysis_complete", {
        provider: "webhook",
        source: input.source,
        outputChars: webhookOutput.length,
        processingMs: Date.now() - startedAt,
      });
      return webhookOutput;
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown AI analysis error.";
    logProctorEvent("error", "ai_analysis_error", {
      source: input.source,
      processingMs: Date.now() - startedAt,
      reason,
    });
    return `${fallbackAnalysis(input)} Error: ${reason}`;
  }

  logProctorEvent("warn", "ai_analysis_fallback", {
    source: input.source,
    processingMs: Date.now() - startedAt,
    reason: "No provider configured or provider returned empty output.",
  });

  return fallbackAnalysis(input);
};
