type KnowledgeSection = {
  topic: string;
  guidance: string[];
  sources: string[];
};

const normalizeTopicKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[\s_-]+/g, "")
    .trim();

const TOPIC_ALIASES: Record<string, string> = {
  react: "React",
  reactnative: "React Native",
  rn: "React Native",
  node: "Node.js",
  nodejs: "Node.js",
  express: "Express.js",
  expressjs: "Express.js",
  typescript: "TypeScript",
  ts: "TypeScript",
  php: "PHP",
  sql: "SQL",
};

const DEFAULT_TECH_KNOWLEDGE: KnowledgeSection[] = [
  {
    topic: "React",
    guidance: [
      "Hooks can only be called at the top level of React function components or custom hooks.",
      "Do not call hooks inside loops, conditions, nested functions, or try/catch/finally blocks.",
      "useState updates schedule a new render; they do not mutate the current render's state snapshot.",
      "When updating from previous state, prefer updater form: setValue(prev => next).",
    ],
    sources: [
      "https://react.dev/reference/rules/rules-of-hooks",
      "https://react.dev/reference/react/useState",
    ],
  },
  {
    topic: "React Native",
    guidance: [
      "React Native provides core building blocks like View, Text, Image, and TextInput.",
      "Use props to configure components; use state for data that changes over time.",
      "React Native uses Flexbox with defaults that differ from web CSS (notably flexDirection: column and flexShrink: 0).",
      "Touchable elements are accessible by default; include accessibilityLabel/accessibilityHint for clarity.",
      "React Native component logic follows React semantics for hooks and context.",
    ],
    sources: [
      "https://reactnative.dev/docs/components-and-apis",
      "https://reactnative.dev/docs/props",
      "https://reactnative.dev/docs/intro-react",
      "https://reactnative.dev/docs/flexbox",
      "https://reactnative.dev/docs/accessibility",
    ],
  },
  {
    topic: "Node.js",
    guidance: [
      "Node.js is single-threaded for JavaScript callbacks and relies on the event loop for concurrency.",
      "Prefer non-blocking async I/O APIs to keep throughput high and avoid starving other requests.",
      "Avoid CPU-heavy work on the event loop path; keep per-request work bounded.",
    ],
    sources: [
      "https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick",
      "https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop",
      "https://nodejs.org/en/docs/guides/blocking-vs-non-blocking/",
    ],
  },
  {
    topic: "Express.js",
    guidance: [
      "Middleware must either end the request-response cycle or call next() to avoid hanging requests.",
      "Pass errors to next(err), and place error handlers after regular middleware/routes.",
      "In Express 5, rejected async handlers/middleware are forwarded to next(value).",
    ],
    sources: [
      "https://expressjs.com/en/guide/using-middleware.html",
      "https://expressjs.com/en/guide/error-handling",
    ],
  },
  {
    topic: "TypeScript",
    guidance: [
      "Use narrowing with typeof/in/instanceof and control-flow analysis before using union members.",
      "Use generic constraints (e.g., Key extends keyof Type) to keep reusable APIs type-safe.",
      "Prefer specific types and inferred generics over any when possible.",
    ],
    sources: [
      "https://www.typescriptlang.org/docs/handbook/2/narrowing.html",
      "https://www.typescriptlang.org/docs/handbook/2/generics.html",
    ],
  },
  {
    topic: "PHP",
    guidance: [
      "Use PDO prepared statements with bound parameters for user input.",
      "Do not concatenate raw user input into SQL strings.",
      "Choose one parameter style per statement (named or positional), not both.",
    ],
    sources: [
      "https://www.php.net/manual/en/pdo.prepare.php",
      "https://www.php.net/manual/en/pdo.prepared-statements.php",
    ],
  },
  {
    topic: "SQL",
    guidance: [
      "Write explicit JOIN ... ON queries for clarity and maintainability.",
      "Qualify column names in joins to avoid ambiguity.",
      "Use transactions (BEGIN/COMMIT/ROLLBACK, SAVEPOINT) for multi-step consistency.",
    ],
    sources: [
      "https://www.postgresql.org/docs/current/tutorial-join.html",
      "https://www.postgresql.org/docs/current/tutorial-transactions.html",
    ],
  },
];

const parseTopicFilter = () => {
  const raw = process.env.PROCTOR_AI_KNOWLEDGE_TOPICS?.trim();
  if (!raw) {
    return null;
  }

  const allowed = new Set(
    raw
      .split(",")
      .map((topic) => TOPIC_ALIASES[normalizeTopicKey(topic)] ?? topic.trim())
      .filter(Boolean),
  );

  return allowed.size > 0 ? allowed : null;
};

export const shouldIncludeTechKnowledge = () => {
  const raw = process.env.PROCTOR_AI_INCLUDE_TECH_KNOWLEDGE?.trim().toLowerCase();
  if (!raw) {
    return true;
  }

  return raw !== "false" && raw !== "0" && raw !== "off" && raw !== "no";
};

export const getTechKnowledgeContext = () => {
  const topicFilter = parseTopicFilter();
  const sectionByTopic = new Map(
    DEFAULT_TECH_KNOWLEDGE.map((section) => [normalizeTopicKey(section.topic), section]),
  );
  const selected = topicFilter
    ? Array.from(topicFilter)
        .map((topic) => sectionByTopic.get(normalizeTopicKey(topic)))
        .filter((section): section is KnowledgeSection => Boolean(section))
    : DEFAULT_TECH_KNOWLEDGE;

  if (!selected.length) {
    return "";
  }

  const blocks = selected.map((section) => {
    const guidanceLines = section.guidance.map((item) => `- ${item}`).join("\n");
    const sourceLines = section.sources.map((source) => `  - ${source}`).join("\n");

    return [
      `[${section.topic}]`,
      guidanceLines,
      "Official sources:",
      sourceLines,
    ].join("\n");
  });

  return [
    "Use this validated web knowledge while solving technical questions:",
    ...blocks,
    "",
    "If screenshot content conflicts with this knowledge, prefer the official-source rules above and explain the correction.",
  ].join("\n\n");
};
