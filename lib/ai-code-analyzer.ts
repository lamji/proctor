import { logProctorEvent } from '@/lib/proctor-logger';

type AnalyzeCodeInput = {
  promptComment: string;
  currentCode: string;
  language?: string;
};

type AnalyzeCodeOutput = {
  completion: string;
  analysis: string;
};

const DEFAULT_MAX_OUTPUT_TOKENS = 900;

const resolveMaxOutputTokens = () => {
  const rawMaxTokens = Number.parseInt(process.env.PROCTOR_AI_MAX_OUTPUT_TOKENS ?? '', 10);
  if (!Number.isFinite(rawMaxTokens) || rawMaxTokens <= 0) {
    return DEFAULT_MAX_OUTPUT_TOKENS;
  }

  return Math.min(rawMaxTokens, 4000);
};

const extractResponseText = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const root = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };

  if (typeof root.output_text === 'string' && root.output_text.trim().length > 0) {
    return root.output_text.trim();
  }

  const chunks = root.output
    ?.flatMap((item) => item.content ?? [])
    .filter((content) => content?.type === 'output_text' && typeof content.text === 'string')
    .map((content) => content.text?.trim())
    .filter((text): text is string => Boolean(text));

  if (!chunks?.length) {
    return null;
  }

  return chunks.join('\n\n');
};

const tailwindDocsKnowledge = [
  'Tailwind docs guidance:',
  '- Prefer utility classes in className over inline style objects for styling.',
  '- Use mobile-first responsive variants (e.g. md:, lg:).',
  '- Use state variants like hover:, focus:, disabled: where relevant.',
  '- Keep class names explicit strings so Tailwind can detect and generate styles.',
  '- In React/JSX use className, not class.',
  '- Keep spacing/layout with utilities such as flex, grid, gap-*, justify-*, items-*.',
  'Reference docs: https://tailwindcss.com/docs, https://tailwindcss.com/docs/styling-with-utility-classes, https://tailwindcss.com/docs/responsive-design',
].join('\n');

const styleIntentRegex =
  /\b(style|styling|css|tailwind|className|class|layout|spacing|padding|margin|color|background|bg-|font|ui|align|responsive|hover|focus|design)\b/i;

const behaviorIntentRegex =
  /\b(function|logic|behavior|flow|algorithm|state|handler|click|onClick|increment|decrement|add|minus|plus|compute|validate|fetch|api|condition|if|else|loop|typescript|javascript|react state)\b/i;

const detectIntentMode = ({ promptComment }: AnalyzeCodeInput): 'style' | 'behavior' | 'mixed' => {
  const comment = promptComment.trim();
  if (!comment) {
    return 'style';
  }

  const hasStyleIntent = styleIntentRegex.test(comment);
  const hasBehaviorIntent = behaviorIntentRegex.test(comment);

  if (hasStyleIntent && hasBehaviorIntent) {
    return 'mixed';
  }

  if (hasBehaviorIntent) {
    return 'behavior';
  }

  if (hasStyleIntent) {
    return 'style';
  }

  return 'behavior';
};

const parseOutput = (text: string): AnalyzeCodeOutput => {
  const completionMarker = /COMPLETION:\s*/i;
  const explanationMarker = /EXPLANATION:\s*/i;

  const completionMatch = completionMarker.exec(text);
  const explanationMatch = explanationMarker.exec(text);

  if (!completionMatch) {
    return {
      completion: text.trim(),
      analysis: 'Completion generated from comment prompt.',
    };
  }

  const completionStart = completionMatch.index + completionMatch[0].length;
  const completionEnd = explanationMatch ? explanationMatch.index : text.length;
  const completion = text.slice(completionStart, completionEnd).trim();

  const explanation = explanationMatch
    ? text.slice(explanationMatch.index + explanationMatch[0].length).trim()
    : 'Completion generated from comment prompt.';

  return {
    completion: completion || text.trim(),
    analysis: explanation || 'Completion generated from comment prompt.',
  };
};

const analyzeWithGroq = async ({ promptComment, currentCode, language }: AnalyzeCodeInput) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return null;
  }

  const model = process.env.GROQ_CODE_MODEL ?? process.env.GROQ_VISION_MODEL ?? 'meta-llama/llama-4-scout-17b-16e-instruct';

  const intentMode = detectIntentMode({ promptComment, currentCode, language });
  const isStyleFixMode = intentMode === 'style';

  const basePrompt = [
    'You are a coding completion assistant.',
    'Primary rule: infer the developer intent from Comment Prompt first, then apply only the requested change.',
    'Do not add unrelated improvements, refactors, wrappers, or extra styling.',
    'Preserve structure, behavior, and all existing classes unless the request explicitly says to change them.',
    'Return only this format:',
    'COMPLETION:',
    '<code to insert next>',
    'EXPLANATION:',
    '<short reason in <= 80 words>',
    'Do not wrap completion in markdown fences.',
    'Do not ask the developer to paste code; the provided context is sufficient.',
  ].join(' ');

  const styleFixPrompt = [
    'Intent mode: STYLE.',
    'Treat this as a style/UI task.',
    'If UI/frontend code is involved, prefer Tailwind CSS utility classes.',
    'Use shadcn/ui components only when explicitly requested or already used in the file.',
    'If the request is to add/change a background class, only modify background class tokens.',
    'Never add spacing classes (p-*, px-*, py-*, m-*, mx-*, my-*) unless explicitly requested.',
    'Avoid inline style objects unless explicitly requested.',
    'Preserve behavior and structure as much as possible.',
  ].join(' ');

  const behaviorPrompt = [
    'Intent mode: BEHAVIOR.',
    'Treat this as a JavaScript/TypeScript functionality task.',
    'Implement logic/state/handlers required by the comment.',
    'Do not perform style-only rewrites.',
    'Do not swap component libraries or rewrite HTML to shadcn unless explicitly requested.',
    'Keep existing styling/class names unchanged unless the comment explicitly asks for style changes.',
  ].join(' ');

  const mixedPrompt = [
    'Intent mode: MIXED.',
    'Apply both behavior and style requests, but only what is explicitly stated.',
    'Prioritize correctness of logic first, then minimal style updates.',
  ].join(' ');

  const prompt =
    intentMode === 'style'
      ? `${basePrompt} ${styleFixPrompt}`
      : intentMode === 'mixed'
        ? `${basePrompt} ${mixedPrompt}`
        : `${basePrompt} ${behaviorPrompt}`;

  const contextualKnowledge = isStyleFixMode ? `\n\n${tailwindDocsKnowledge}` : '';

  const response = await fetch('https://api.groq.com/openai/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_output_tokens: resolveMaxOutputTokens(),
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `${prompt}${contextualKnowledge}\n\nLanguage: ${language || 'unknown'}\nInferred Intent Mode: ${intentMode}\nComment Prompt: ${promptComment || '(none)'}\n\nCurrent Code Context:\n${currentCode}`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Groq code analysis failed (${response.status}): ${details}`);
  }

  const payload = (await response.json()) as unknown;
  const outputText = extractResponseText(payload);
  if (!outputText) {
    return null;
  }

  return parseOutput(outputText);
};

const fallbackOutput = ({ promptComment }: AnalyzeCodeInput): AnalyzeCodeOutput => ({
  completion: `// AI fallback: implement requested behavior for: ${promptComment}`,
  analysis: 'No AI provider configured. Set GROQ_API_KEY to generate real code completions.',
});

export const analyzeCodeFromComment = async (input: AnalyzeCodeInput): Promise<AnalyzeCodeOutput> => {
  const startedAt = Date.now();

  try {
    const groqOutput = await analyzeWithGroq(input);
    if (groqOutput) {
      logProctorEvent('info', 'ai_code_completion_complete', {
        provider: 'groq',
        outputChars: groqOutput.completion.length,
        processingMs: Date.now() - startedAt,
      });
      return groqOutput;
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown AI code analysis error.';
    logProctorEvent('error', 'ai_code_completion_error', {
      processingMs: Date.now() - startedAt,
      reason,
    });
    return {
      ...fallbackOutput(input),
      analysis: `Fallback used because provider failed: ${reason}`,
    };
  }

  logProctorEvent('warn', 'ai_code_completion_fallback', {
    processingMs: Date.now() - startedAt,
    reason: 'No provider configured or provider returned empty output.',
  });

  return fallbackOutput(input);
};
