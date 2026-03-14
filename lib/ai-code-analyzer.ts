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

type IntentMode = 'style' | 'behavior' | 'mixed';
type InstructionCategory = 'behavior' | 'style' | 'refactor' | 'tests' | 'docs';

type TaskProfile = {
  intentMode: IntentMode;
  primaryCategory: InstructionCategory;
  requestedActions: string[];
  constraints: string[];
  mentionedIdentifiers: string[];
  codeSignals: string[];
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

const categorySignals: Record<InstructionCategory, RegExp> = {
  behavior:
    /\b(function|logic|behavior|flow|algorithm|state|handler|click|onclick|increment|decrement|add|minus|plus|compute|validate|fetch|api|condition|if|else|loop|typescript|javascript|bug|fix|implement)\b/i,
  style:
    /\b(style|styling|css|tailwind|classname|class|layout|spacing|padding|margin|color|background|bg-|font|ui|align|responsive|hover|focus|design|visual)\b/i,
  refactor: /\b(refactor|cleanup|simplify|restructure|optimize|improve readability)\b/i,
  tests: /\b(test|tests|unit test|integration|assert|coverage|jest|vitest|playwright)\b/i,
  docs: /\b(comment|docs|documentation|explain|readme|description|typing)\b/i,
};

const extractRequestedActions = (text: string) => {
  const normalized = text.toLowerCase();
  const verbs = [
    'add',
    'remove',
    'fix',
    'implement',
    'update',
    'replace',
    'refactor',
    'optimize',
    'validate',
    'calculate',
    'handle',
    'wire',
  ];

  return verbs.filter((verb) => new RegExp(`\\b${verb}\\b`, 'i').test(normalized));
};

const extractConstraints = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /\b(only|must|should|do not|don't|without|keep|preserve|exact|strict|cannot|never)\b/i.test(line))
    .slice(0, 8);

const extractMentionedIdentifiers = (text: string) => {
  const inlineCodeMatches = [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1]?.trim()).filter(Boolean) as string[];
  const identifierMatches = [...text.matchAll(/\b([a-zA-Z_$][\w$]{2,})\b/g)]
    .map((match) => match[1])
    .filter((token) => /[A-Z_]|[a-z].*[A-Z]/.test(token) || /^(on|handle|set|get|use)[A-Z]/.test(token))
    .slice(0, 10);

  return [...new Set([...inlineCodeMatches, ...identifierMatches])].slice(0, 12);
};

const extractCodeSignals = (code: string, language?: string) => {
  const signals: string[] = [];
  const lowerLang = (language || '').toLowerCase();
  if (lowerLang) {
    signals.push(`Language appears to be: ${lowerLang}`);
  }

  if (/\buseState\b|\buseMemo\b|\buseEffect\b/.test(code)) {
    signals.push('Uses React hooks/stateful component patterns.');
  }
  if (/\bclassName=/.test(code) || /\btailwind\b/i.test(code)) {
    signals.push('Contains utility-class based styling (Tailwind-like).');
  }
  if (/from\s+['"]@\/components\/ui\//.test(code) || /from\s+['"]@shadcn\/ui['"]/.test(code)) {
    signals.push('Uses shadcn/ui component imports.');
  }
  if (/function\s+\w+\s*\(|const\s+\w+\s*=\s*\(/.test(code)) {
    signals.push('Contains function boundaries suitable for focused code patching.');
  }
  if (/TODO|FIXME|\/\*\*?[\s\S]*?\*\//.test(code)) {
    signals.push('Contains inline comments/TODOs that may define instruction scope.');
  }

  return signals.slice(0, 8);
};

const buildTaskProfile = ({ promptComment, currentCode, language }: AnalyzeCodeInput): TaskProfile => {
  const comment = promptComment.trim();
  const normalizedComment = comment.toLowerCase();
  const scores: Record<InstructionCategory, number> = {
    behavior: 0,
    style: 0,
    refactor: 0,
    tests: 0,
    docs: 0,
  };

  (Object.keys(categorySignals) as InstructionCategory[]).forEach((category) => {
    if (categorySignals[category].test(normalizedComment)) {
      scores[category] += 2;
    }
  });

  if (!comment) {
    scores.behavior += 1;
  }

  const sortedCategories = (Object.keys(scores) as InstructionCategory[]).sort((a, b) => scores[b] - scores[a]);
  const primaryCategory = sortedCategories[0] || 'behavior';
  const secondaryCategory = sortedCategories[1];

  const intentMode: IntentMode =
    scores.style > 0 && scores.behavior > 0
      ? 'mixed'
      : primaryCategory === 'style'
        ? 'style'
        : 'behavior';

  const requestedActions = extractRequestedActions(comment);
  const constraints = extractConstraints(comment);
  const mentionedIdentifiers = extractMentionedIdentifiers(comment);
  const codeSignals = extractCodeSignals(currentCode, language);

  if (secondaryCategory && scores[secondaryCategory] > 0 && secondaryCategory !== primaryCategory) {
    codeSignals.push(`Secondary request signal detected: ${secondaryCategory}`);
  }

  return {
    intentMode,
    primaryCategory,
    requestedActions,
    constraints,
    mentionedIdentifiers,
    codeSignals,
  };
};

const looksLikeStyleRewrite = (completion: string) =>
  /\b(className\s*=|style\s*=|tailwind|bg-|text-|p-\d|m-\d|from\s+['"]@shadcn\/ui['"]|lucide-react)\b/i.test(
    completion,
  );

const looksLikeCodeRequestRefusal = (completion: string) =>
  /\b(no code to complete|provide the code|paste the code|insufficient code|cannot proceed without code)\b/i.test(
    completion,
  );

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

  const taskProfile = buildTaskProfile({ promptComment, currentCode, language });
  const { intentMode } = taskProfile;
  const isStyleFixMode = intentMode === 'style';

  const basePrompt = [
    'You are a coding completion assistant.',
    'Primary rule: infer the developer intent from Comment Prompt and Current Code Context, then apply only requested changes.',
    'Do not add unrelated improvements, refactors, wrappers, or extra styling.',
    'Preserve unchanged parts of structure and behavior unless the instruction explicitly asks to change them.',
    'Return only this format:',
    'COMPLETION:',
    '<code to insert next>',
    'EXPLANATION:',
    '<short reason in <= 80 words>',
    'Do not wrap completion in markdown fences.',
    'Do not ask the developer to paste code; the provided context is sufficient.',
  ].join(' ');

  const behaviorPrompt = [
    'Intent mode: BEHAVIOR.',
    'Focus on functionality, state transitions, data handling, and event logic.',
    'Avoid style rewrites unless explicitly requested.',
    'Do not swap UI libraries unless explicitly requested.',
  ].join(' ');

  const styleFixPrompt = [
    'Intent mode: STYLE.',
    'Focus on UI/styling/layout changes.',
    'Preserve behavior and logic unless explicitly requested.',
    'Prefer existing styling conventions from context.',
  ].join(' ');

  const mixedPrompt = [
    'Intent mode: MIXED.',
    'Handle both logic and style only where comment explicitly requests both.',
    'Prioritize logic correctness before visual refinements.',
  ].join(' ');

  const dynamicProfilePrompt = [
    `Primary category: ${taskProfile.primaryCategory}.`,
    taskProfile.requestedActions.length
      ? `Requested actions: ${taskProfile.requestedActions.join(', ')}.`
      : 'Requested actions: infer from imperative phrases in comment.',
    taskProfile.constraints.length
      ? `Explicit constraints:\n- ${taskProfile.constraints.join('\n- ')}`
      : 'Explicit constraints: none detected; keep edits minimal and focused.',
    taskProfile.mentionedIdentifiers.length
      ? `Likely target identifiers/symbols: ${taskProfile.mentionedIdentifiers.join(', ')}.`
      : 'Likely target identifiers/symbols: infer from code nearest to comment.',
    taskProfile.codeSignals.length
      ? `Code signals:\n- ${taskProfile.codeSignals.join('\n- ')}`
      : 'Code signals: use current code structure to infer patch location.',
  ].join('\n');

  const prompt =
    intentMode === 'style'
      ? `${basePrompt} ${styleFixPrompt}\n${dynamicProfilePrompt}`
      : intentMode === 'mixed'
        ? `${basePrompt} ${mixedPrompt}\n${dynamicProfilePrompt}`
        : `${basePrompt} ${behaviorPrompt}\n${dynamicProfilePrompt}`;

  const contextualKnowledge = isStyleFixMode ? `\n\n${tailwindDocsKnowledge}` : '';

  const buildRequestBody = (activePrompt: string) => ({
    model,
    max_output_tokens: resolveMaxOutputTokens(),
    temperature: 0.1,
    top_p: 0.9,
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `${activePrompt}${contextualKnowledge}\n\nLanguage: ${language || 'unknown'}\nInferred Intent Mode: ${intentMode}\nComment Prompt: ${promptComment || '(none)'}\n\nCurrent Code Context:\n${currentCode}`,
          },
        ],
      },
    ],
  });

  const response = await fetch('https://api.groq.com/openai/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildRequestBody(prompt)),
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
  const parsed = parseOutput(outputText);

  if (looksLikeCodeRequestRefusal(parsed.completion)) {
    const noRefusalPrompt = `${prompt}\nHard requirement: Never ask for more code; generate the best possible patch from given context.`;
    const retryResponse = await fetch('https://api.groq.com/openai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildRequestBody(noRefusalPrompt)),
    });

    if (retryResponse.ok) {
      const retryPayload = (await retryResponse.json()) as unknown;
      const retryText = extractResponseText(retryPayload);
      if (retryText) {
        return parseOutput(retryText);
      }
    }
  }

  if (intentMode === 'behavior' && looksLikeStyleRewrite(parsed.completion)) {
    const strictBehaviorPrompt = `${basePrompt} ${behaviorPrompt} Never modify className, style props, UI library imports, or visual classes for behavior-only tasks.`;
    const retryResponse = await fetch('https://api.groq.com/openai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildRequestBody(strictBehaviorPrompt)),
    });

    if (retryResponse.ok) {
      const retryPayload = (await retryResponse.json()) as unknown;
      const retryText = extractResponseText(retryPayload);
      if (retryText) {
        return parseOutput(retryText);
      }
    }
  }

  return parsed;
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
