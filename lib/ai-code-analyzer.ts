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
  functionOnlyMode: boolean;
  targetFunctionName: string | null;
  noCommentMode: boolean;
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

const extractTargetFunctionName = (code: string) => {
  const constFnMatch = code.match(/\bconst\s+([a-zA-Z_$][\w$]*)\s*=\s*\(/);
  if (constFnMatch?.[1]) {
    return constFnMatch[1];
  }

  const namedFnMatch = code.match(/\bfunction\s+([a-zA-Z_$][\w$]*)\s*\(/);
  if (namedFnMatch?.[1]) {
    return namedFnMatch[1];
  }

  return null;
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
    scores.style += 1;
  }

  const sortedCategories = (Object.keys(scores) as InstructionCategory[]).sort((a, b) => scores[b] - scores[a]);
  const primaryCategory = sortedCategories[0] || 'behavior';
  const secondaryCategory = sortedCategories[1];

  const noCommentMode = comment.length === 0;
  const intentMode: IntentMode = noCommentMode
    ? 'style'
    : scores.style > 0 && scores.behavior > 0
      ? 'mixed'
      : primaryCategory === 'style'
        ? 'style'
        : 'behavior';

  const requestedActions = extractRequestedActions(comment);
  const constraints = extractConstraints(comment);
  const mentionedIdentifiers = extractMentionedIdentifiers(comment);
  const codeSignals = extractCodeSignals(currentCode, language);
  const functionOnlyMode =
    /\b(just|only)\s+(create|implement|write)\s+(a\s+)?function\b/i.test(comment) ||
    /\bdo\s+not\s+change\b/i.test(comment) ||
    /\bdon['’]?t\s+change\b/i.test(comment) ||
    /\bwithout\s+changing\b/i.test(comment);
  const targetFunctionName = extractTargetFunctionName(currentCode);

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
    functionOnlyMode,
    targetFunctionName,
    noCommentMode,
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

const looksLikeNoOpResponse = (completion: string) =>
  /\b(no changes inferred|no changes needed|no modifications? (can be|were)? made|without further instructions|cannot accurately suggest|no clear intent|assuming the intent|no changes are proposed)\b/i.test(
    completion,
  );

const looksLikeProseHeavyOutput = (completion: string) =>
  /\b(however|alternative|assuming|for a more precise fix|likely|isn['’]?t specified|consider defining|based on the given instructions)\b/i.test(
    completion,
  );

const sanitizeCompletion = (completion: string) => {
  let text = completion.trim();
  if (!text) {
    return text;
  }

  // If model leaked repeated sections, keep only the first completion segment.
  const repeatedCompletionIndex = text.toUpperCase().indexOf('\nCOMPLETION:', 1);
  if (repeatedCompletionIndex > 0) {
    text = text.slice(0, repeatedCompletionIndex).trim();
  }

  // Remove explanatory tail if model appended natural-language analysis.
  const proseStart = text.search(
    /\n(?:However|But since|A more accurate implementation|For a more precise fix|Let's assume)/i,
  );
  if (proseStart > 0) {
    text = text.slice(0, proseStart).trim();
  }

  // Unwrap fenced code if present.
  const fenced = text.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  return text;
};

const findBlockEndIndex = (text: string, openBraceIndex: number) => {
  let depth = 0;
  for (let i = openBraceIndex; i < text.length; i += 1) {
    if (text[i] === '{') {
      depth += 1;
    } else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
};

const extractNamedFunctionBlock = (text: string, functionName: string) => {
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const arrowPattern = new RegExp(`\\bconst\\s+${escapedName}\\s*=\\s*\\([^)]*\\)\\s*=>\\s*\\{`, 'm');
  const namedPattern = new RegExp(`\\bfunction\\s+${escapedName}\\s*\\([^)]*\\)\\s*\\{`, 'm');

  const arrowMatch = arrowPattern.exec(text);
  if (arrowMatch?.index !== undefined) {
    const openBraceIndex = text.indexOf('{', arrowMatch.index);
    if (openBraceIndex >= 0) {
      const endIndex = findBlockEndIndex(text, openBraceIndex);
      if (endIndex > openBraceIndex) {
        return text.slice(arrowMatch.index, endIndex + 1).trim();
      }
    }
  }

  const namedMatch = namedPattern.exec(text);
  if (namedMatch?.index !== undefined) {
    const openBraceIndex = text.indexOf('{', namedMatch.index);
    if (openBraceIndex >= 0) {
      const endIndex = findBlockEndIndex(text, openBraceIndex);
      if (endIndex > openBraceIndex) {
        return text.slice(namedMatch.index, endIndex + 1).trim();
      }
    }
  }

  return null;
};

const normalizeFunctionOnlyCompletion = (
  completion: string,
  targetFunctionName: string | null,
) => {
  const sanitized = sanitizeCompletion(completion);
  if (!sanitized) {
    return sanitized;
  }

  if (targetFunctionName) {
    const extracted = extractNamedFunctionBlock(sanitized, targetFunctionName);
    if (extracted) {
      return extracted;
    }
  }

  return sanitized;
};

const detectQualityIssues = (completion: string, currentCode: string) => {
  const issues: string[] = [];
  const normalized = completion.trim();

  if (!normalized) {
    issues.push('Completion is empty.');
    return issues;
  }

  const hasComponentInContext = /\bfunction\s+[A-Z]\w*\s*\(|\bconst\s+[A-Z]\w*\s*=\s*\(/.test(currentCode);
  const functionDecls = normalized.match(/\bfunction\s+[A-Z]\w*\s*\(/g) ?? [];
  if (hasComponentInContext && functionDecls.length > 1) {
    issues.push('Completion appears to redeclare component scaffolding multiple times.');
  }

  const hasRootInContext = /\bcreateRoot\s*\(/.test(currentCode);
  if (hasRootInContext && /\bcreateRoot\s*\(/.test(normalized)) {
    issues.push('Completion duplicates local render root bootstrapping already present in context.');
  }

  if (/\bconst\s*\[\s*totalPoints\s*,\s*setTotalPoints\s*\]\s*=/.test(normalized)) {
    issues.push('Completion creates state for totalPoints; this often shadows/duplicates incoming props.');
  }

  if (/\bsetStrength\(\s*strength\s*-\s*1\s*\)/.test(normalized) && !/\bstrength\s*>\s*0\b/.test(normalized)) {
    issues.push('Completion decrements strength without clear non-negative guard.');
  }

  if (/\bsetSpeed\(\s*speed\s*-\s*1\s*\)/.test(normalized) && !/\bspeed\s*>\s*0\b/.test(normalized)) {
    issues.push('Completion decrements speed without clear non-negative guard.');
  }

  if (!/COMPLETION:|EXPLANATION:/i.test(normalized) && normalized.length > 3000) {
    issues.push('Completion is excessively large and likely includes duplicated unrelated code.');
  }
  if (looksLikeProseHeavyOutput(normalized)) {
    issues.push('Completion includes explanation/prose instead of code-only output.');
  }

  return issues;
};

const detectFunctionOnlyViolations = (
  completion: string,
  targetFunctionName: string | null,
) => {
  const violations: string[] = [];
  const normalized = completion.trim();

  if (/\bimport\s+.+from\s+['"]/.test(normalized)) {
    violations.push('Adds or edits imports, but task is function-only.');
  }
  if (/\bcreateRoot\s*\(|\broot\.render\s*\(|document\.body\.innerHTML/.test(normalized)) {
    violations.push('Touches app bootstrap/render root code, which is outside function scope.');
  }
  if (/\breturn\s*\(\s*</.test(normalized)) {
    violations.push('Includes JSX/component body instead of function-only logic.');
  }
  if (/\buseState\s*\(|\buseEffect\s*\(|\buseMemo\s*\(/.test(normalized)) {
    violations.push('Introduces hook/state changes outside requested function-only scope.');
  }
  if (/\bconst\s+(strength|speed|totalPoints)\b/.test(normalized)) {
    violations.push('Declares strength/speed/totalPoints instead of implementing only target function logic.');
  }
  const targetDeclPattern = targetFunctionName
    ? new RegExp(`\\bconst\\s+${targetFunctionName}\\s*=`, 'g')
    : /\bconst\s+[a-zA-Z_$][\w$]*\s*=/g;
  const targetDeclMatches = normalized.match(targetDeclPattern) ?? [];
  if (targetDeclMatches.length > 1) {
    violations.push('Redeclares target function multiple times.');
  }
  if (looksLikeProseHeavyOutput(normalized)) {
    violations.push('Includes explanatory prose in function-only output.');
  }
  if (targetFunctionName && !new RegExp(`\\b${targetFunctionName}\\b`).test(normalized)) {
    violations.push(`Output does not appear to target function: ${targetFunctionName}.`);
  }

  return violations;
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
    completion: completion.trim(),
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
  const isStyleFixMode = intentMode === 'style' || taskProfile.noCommentMode;

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
    taskProfile.functionOnlyMode
      ? `Strict scope mode: function-only. Modify only ${taskProfile.targetFunctionName ?? 'the target function'} and nothing else.`
      : 'Strict scope mode: normal.',
    taskProfile.noCommentMode
      ? 'No comment prompt detected: treat as style-debug mode. Infer likely style/class/UI issue(s) from code context and produce one minimal corrective patch.'
      : 'Comment prompt detected: follow explicit instruction.',
  ].join('\n');

  const functionOnlyPrompt = taskProfile.functionOnlyMode
    ? [
        'HARD CONSTRAINTS:',
        `- Edit only function: ${taskProfile.targetFunctionName ?? 'target function in context'}.`,
        '- Do not add imports.',
        '- Do not modify component JSX.',
        '- Do not add or modify createRoot/root.render/document.body lines.',
        '- Return only the function implementation patch.',
      ].join('\n')
    : '';

  const prompt =
    intentMode === 'style'
      ? `${basePrompt} ${styleFixPrompt}\n${dynamicProfilePrompt}\n${functionOnlyPrompt}`
      : intentMode === 'mixed'
        ? `${basePrompt} ${mixedPrompt}\n${dynamicProfilePrompt}\n${functionOnlyPrompt}`
        : `${basePrompt} ${behaviorPrompt}\n${dynamicProfilePrompt}\n${functionOnlyPrompt}`;

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

  const normalizeParsedOutput = (output: AnalyzeCodeOutput): AnalyzeCodeOutput => ({
    ...output,
    completion: taskProfile.functionOnlyMode
      ? normalizeFunctionOnlyCompletion(output.completion, taskProfile.targetFunctionName)
      : sanitizeCompletion(output.completion),
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
  const parsed = normalizeParsedOutput(parseOutput(outputText));

  if (!parsed.completion || looksLikeCodeRequestRefusal(parsed.completion) || looksLikeNoOpResponse(parsed.analysis)) {
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
        return normalizeParsedOutput(parseOutput(retryText));
      }
    }
  }

  if (taskProfile.noCommentMode && (!parsed.completion || looksLikeNoOpResponse(parsed.completion) || looksLikeNoOpResponse(parsed.analysis))) {
    const noCommentFixPrompt = [
      prompt,
      'No-comment mode hard requirement:',
      '- Do not return "no changes inferred" or equivalent.',
      '- Infer one likely style/class/UI issue from current code context.',
      '- Prefer fixing invalid utility classes, invalid JSX style attributes, or obvious className issues.',
      '- Return a minimal concrete code patch only.',
    ].join('\n');

    const retryResponse = await fetch('https://api.groq.com/openai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildRequestBody(noCommentFixPrompt)),
    });

    if (retryResponse.ok) {
      const retryPayload = (await retryResponse.json()) as unknown;
      const retryText = extractResponseText(retryPayload);
      if (retryText) {
        return normalizeParsedOutput(parseOutput(retryText));
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
        return normalizeParsedOutput(parseOutput(retryText));
      }
    }
  }

  const qualityIssues = detectQualityIssues(parsed.completion, currentCode);
  if (qualityIssues.length > 0) {
    const repairPrompt = [
      prompt,
      'Quality gate failed. Rewrite the completion so it is valid and minimal.',
      'Do not duplicate existing scaffolding from Current Code Context.',
      'Do not redeclare root render/bootstrap code if already present.',
      'Do not shadow props with same-name state variables.',
      'Keep handlers and state transitions safe (no negative stat transitions).',
      'Detected issues:',
      ...qualityIssues.map((issue) => `- ${issue}`),
    ].join('\n');

    const repairResponse = await fetch('https://api.groq.com/openai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildRequestBody(repairPrompt)),
    });

    if (repairResponse.ok) {
      const repairPayload = (await repairResponse.json()) as unknown;
      const repairText = extractResponseText(repairPayload);
      if (repairText) {
        const normalizedRepaired = normalizeParsedOutput(parseOutput(repairText));
        const repairedIssues = detectQualityIssues(normalizedRepaired.completion, currentCode);
        if (repairedIssues.length === 0) {
          return normalizedRepaired;
        }
      }
    }
  }

  if (taskProfile.functionOnlyMode) {
    const scopeViolations = detectFunctionOnlyViolations(
      parsed.completion,
      taskProfile.targetFunctionName,
    );

    if (scopeViolations.length > 0) {
      const scopeRepairPrompt = [
        prompt,
        'Scope gate failed. Rewrite output to satisfy strict function-only scope.',
        'Do not touch any non-function lines.',
        'Violations:',
        ...scopeViolations.map((violation) => `- ${violation}`),
      ].join('\n');

      const scopeRepairResponse = await fetch('https://api.groq.com/openai/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(buildRequestBody(scopeRepairPrompt)),
      });

      if (scopeRepairResponse.ok) {
        const scopeRepairPayload = (await scopeRepairResponse.json()) as unknown;
        const scopeRepairText = extractResponseText(scopeRepairPayload);
        if (scopeRepairText) {
          const scoped = normalizeParsedOutput(parseOutput(scopeRepairText));
          const remainingScopeViolations = detectFunctionOnlyViolations(
            scoped.completion,
            taskProfile.targetFunctionName,
          );
          if (remainingScopeViolations.length === 0) {
            return scoped;
          }
        }
      }
    }
  }

  if (taskProfile.noCommentMode && (!parsed.completion || looksLikeNoOpResponse(parsed.completion) || looksLikeNoOpResponse(parsed.analysis) || looksLikeProseHeavyOutput(parsed.completion))) {
    return {
      completion: currentCode.trim(),
      analysis: 'No-comment mode failed to produce a valid style patch. Returning original context for safety (fail-closed).',
    };
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
