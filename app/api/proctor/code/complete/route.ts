import { NextResponse } from 'next/server';

import { corsPreflight, withCors } from '@/lib/proctor-cors';
import { isAuthorizedRequest } from '@/lib/proctor-env-auth';
import { addGlobalCodeCompletionWithAnalysis } from '@/lib/proctor-global-store';
import { getRequestLogMeta, logProctorEvent } from '@/lib/proctor-logger';

export const dynamic = 'force-dynamic';

export const OPTIONS = () => corsPreflight();

export const POST = async (request: Request) => {
  const reqMeta = getRequestLogMeta(request);
  if (!isAuthorizedRequest(request)) {
    logProctorEvent('warn', 'code_complete_unauthorized', reqMeta);
    return withCors(NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 }));
  }

  let body: {
    promptComment?: string;
    currentCode?: string;
    language?: string;
  };

  try {
    body = (await request.json()) as {
      promptComment?: string;
      currentCode?: string;
      language?: string;
    };
  } catch {
    logProctorEvent('warn', 'code_complete_invalid_json', reqMeta);
    return withCors(NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 }));
  }

  const promptComment = body.promptComment?.trim() ?? '';
  const currentCode = body.currentCode ?? '';
  const language = body.language?.trim() || 'plaintext';

  if (!currentCode.trim()) {
    logProctorEvent('warn', 'code_complete_missing_context', reqMeta);
    return withCors(
      NextResponse.json({ ok: false, error: 'currentCode is required.' }, { status: 400 }),
    );
  }

  const capture = await addGlobalCodeCompletionWithAnalysis({
    promptComment,
    currentCode,
    language,
  });

  logProctorEvent('info', 'code_complete_success', {
    ...reqMeta,
    captureId: capture.id,
    language,
    completionChars: capture.completion?.length ?? 0,
  });

  return withCors(
    NextResponse.json({
      ok: true,
      capture,
      completion: capture.completion ?? '',
      analysis: capture.analysis,
    }),
  );
};
