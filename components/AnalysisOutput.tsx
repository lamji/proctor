type Segment =
  | { type: "text"; value: string }
  | { type: "code"; value: string; language: string };

type AnalysisOutputProps = {
  text: string;
};

const FENCE_PATTERN = /```([a-zA-Z0-9_-]+)?\r?\n([\s\S]*?)```/g;

const splitIntoSegments = (text: string): Segment[] => {
  const segments: Segment[] = [];
  let lastIndex = 0;
  FENCE_PATTERN.lastIndex = 0;
  let match = FENCE_PATTERN.exec(text);

  while (match) {
    const [fullMatch, language, code] = match;
    const startIndex = match.index;

    if (startIndex > lastIndex) {
      segments.push({
        type: "text",
        value: text.slice(lastIndex, startIndex),
      });
    }

    segments.push({
      type: "code",
      language: language?.toLowerCase() || "text",
      value: code.replace(/\n$/, ""),
    });

    lastIndex = startIndex + fullMatch.length;
    match = FENCE_PATTERN.exec(text);
  }

  if (lastIndex < text.length) {
    segments.push({
      type: "text",
      value: text.slice(lastIndex),
    });
  }

  return segments.length ? segments : [{ type: "text", value: text }];
};

export function AnalysisOutput({ text }: AnalysisOutputProps) {
  const segments = splitIntoSegments(text);

  return (
    <div className="mt-2 w-full space-y-3 text-xs text-neutral-700 sm:text-sm">
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          const normalized = segment.value.trim();
          if (!normalized) {
            return null;
          }

          return (
            <p key={`text-${index}`} className="whitespace-pre-wrap break-words leading-relaxed">
              {normalized}
            </p>
          );
        }

        return (
          <div
            key={`code-${index}`}
            className="overflow-hidden rounded-lg border border-neutral-700 bg-neutral-950 text-neutral-100"
          >
            <div className="border-b border-neutral-800 bg-neutral-900 px-3 py-1 text-[10px] uppercase tracking-wide text-neutral-400 sm:text-[11px]">
              {segment.language}
            </div>
            <pre className="max-w-full overflow-x-auto p-3 text-[11px] leading-relaxed sm:text-xs">
              <code>{segment.value}</code>
            </pre>
          </div>
        );
      })}
    </div>
  );
}
