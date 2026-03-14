'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnalysisOutput } from '@/components/AnalysisOutput';
import { apiUrl, getApiBase } from '@/lib/api-client';

type CaptureRecord = {
  id: string;
  imageDataUrl: string | null;
  createdAt: string;
  source: 'screen' | 'tab' | 'window' | 'vscode';
  analysis: string;
  promptComment?: string;
  submittedCode?: string;
  completion?: string;
};

type ProctorState = {
  pendingCommands: number;
  captures: CaptureRecord[];
};

type LoginResponse = {
  ok: boolean;
  token?: string;
  error?: string;
};

type StateResponse = {
  ok: boolean;
  state?: ProctorState;
  error?: string;
};

const REFRESH_INTERVAL_MS = 2000;
const EMPTY_STATE: ProctorState = {
  pendingCommands: 0,
  captures: [],
};

export default function Page() {
  const [username, setUsername] = useState('proctor');
  const [password, setPassword] = useState('proctor123');
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [state, setState] = useState<ProctorState>(EMPTY_STATE);

  const [message, setMessage] = useState<string>('Login first, then send capture command.');
  const [loading, setLoading] = useState(false);
  const apiBase = getApiBase();

  const getAuthHeaders = useCallback(() => {
    if (!authToken) {
      throw new Error('Please login first.');
    }

    return {
      Authorization: `Bearer ${authToken}`,
    };
  }, [authToken]);

  const refreshState = useCallback(async () => {
    if (!authToken) {
      return;
    }

    const response = await fetch(apiUrl('/api/proctor/state'), {
      cache: 'no-store',
      headers: getAuthHeaders(),
    });

    const data = (await response.json()) as StateResponse;

    if (!response.ok || !data.ok || !data.state) {
      throw new Error(data.error ?? 'Failed to refresh state.');
    }

    setState(data.state);
  }, [authToken, getAuthHeaders]);

  const clearCapturedResponses = useCallback(
    async ({ notify = true }: { notify?: boolean } = {}) => {
      const response = await fetch(apiUrl('/api/proctor/state'), {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      const data = (await response.json()) as StateResponse;

      if (!response.ok || !data.ok || !data.state) {
        throw new Error(data.error ?? 'Failed to clear previous captures.');
      }

      setState(data.state);
      if (notify) {
        setMessage('Previous captures cleared.');
      }
    },
    [getAuthHeaders],
  );

  useEffect(() => {
    if (!authToken) {
      return;
    }

    const intervalId = window.setInterval(() => {
      refreshState().catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : 'State refresh failed.';
        setMessage(reason);
      });
    }, REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [authToken, refreshState]);

  const handleLogin = async () => {
    setLoading(true);

    try {
      const response = await fetch(apiUrl('/api/proctor/auth/login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = (await response.json()) as LoginResponse;

      if (!response.ok || !data.ok || !data.token) {
        throw new Error(data.error ?? 'Login failed.');
      }

      setAuthToken(data.token);
      setMessage('Login successful. Capture controls are ready.');

      const stateResponse = await fetch(apiUrl('/api/proctor/state'), {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${data.token}`,
        },
      });
      const stateData = (await stateResponse.json()) as StateResponse;

      if (stateResponse.ok && stateData.ok && stateData.state) {
        setState(stateData.state);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unexpected login error.';
      setMessage(reason);
    } finally {
      setLoading(false);
    }
  };

  const requestCapture = async () => {
    setLoading(true);

    try {
      await clearCapturedResponses({ notify: false });

      const response = await fetch(apiUrl('/api/proctor/command'), {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'capture_now' }),
      });

      const data = (await response.json()) as { ok: boolean; error?: string };

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? 'Failed to queue capture command.');
      }

      setMessage('Capture command sent. Waiting for extension to upload image...');
      await refreshState();
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unexpected capture error.';
      setMessage(reason);
    } finally {
      setLoading(false);
    }
  };

  const handleClearCaptures = async () => {
    setLoading(true);
    try {
      await clearCapturedResponses();
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unexpected clear error.';
      setMessage(reason);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen w-full bg-[radial-gradient(circle_at_top,_#e0f2fe_0%,_#eef2ff_35%,_#f8fafc_80%)] px-3 py-4">
      <div className="mx-auto flex w-full max-w-md min-w-0 flex-col gap-4 pb-6">
        <header className="rounded-2xl border border-sky-200 bg-white/90 p-4 shadow-sm backdrop-blur-sm">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-sky-600">Exam Proctor</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight text-slate-900">Capture Control</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Login, then send <code>capture_now</code> or VS Code completion requests and inspect AI output.
          </p>
          {/* Add bg-red to main wrapper */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-700">
              Pending: {state.pendingCommands}
            </span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
              Captures: {state.captures.length}
            </span>
          </div>
        </header>
         
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Credentials</h2>
          <div className="mt-3 space-y-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Username</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Username"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-0 transition focus:border-sky-500"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-0 transition focus:border-sky-500"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={handleLogin}
            disabled={loading}
            className="mt-4 h-11 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white transition active:translate-y-px disabled:opacity-60"
          >
            Login
          </button>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Actions</h2>
          <p className="mt-1 text-xs text-slate-500">
            Previous captures are cleared automatically before each new capture.
          </p>
          <div className="mt-3 space-y-2.5">
            <button
              type="button"
              onClick={requestCapture}
              disabled={loading || !authToken}
              className="h-12 w-full rounded-xl bg-sky-600 text-sm font-semibold text-white transition active:translate-y-px disabled:opacity-60"
            >
              Capture Now
            </button>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  refreshState().catch((error: unknown) => {
                    const reason = error instanceof Error ? error.message : 'Failed to refresh state.';
                    setMessage(reason);
                  });
                }}
                disabled={!authToken}
                className="h-11 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 transition active:translate-y-px disabled:opacity-60"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={handleClearCaptures}
                disabled={loading || !authToken}
                className="h-11 rounded-xl border border-rose-200 bg-rose-50 text-sm font-medium text-rose-700 transition active:translate-y-px disabled:opacity-60"
              >
                Clear
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Status</h2>
          <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm leading-relaxed break-words text-slate-700">
            {message}
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Extension Setup</h2>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
            <li>
              API Target: <code>{apiBase}</code>
            </li>
            <li>
              Default by environment:{' '}
              <code>
                {process.env.NODE_ENV === 'development'
                  ? 'http://localhost:3000'
                  : 'https://proctor-phi.vercel.app'}
              </code>
            </li>
            <li>
              Username: <code>{username || '(enter username)'}</code>
            </li>
            <li>Password: same as login field</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-base font-semibold text-slate-900">Captured Frames ({state.captures.length})</h2>
          {!state.captures.length ? (
            <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-600">
              No captures yet. Start extension background mode and tap <strong>Capture Now</strong>.
            </div>
          ) : (
            <div className="mt-3 space-y-0">
              {state.captures.map((capture) => (
                <article
                  key={capture.id}
                  className="w-full min-w-0 rounded-xl bg-white p-0"
                >
                  {capture.imageDataUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={capture.imageDataUrl}
                        alt={`Capture ${capture.id}`}
                        className="h-auto w-full rounded-lg border border-slate-200"
                      />
                    </>
                  ) : (
                    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      {capture.promptComment ? (
                        <p className="text-xs text-slate-700">
                          <strong>Prompt Comment:</strong> {capture.promptComment}
                        </p>
                      ) : null}
                      {capture.submittedCode ? (
                        <pre className="whitespace-pre-wrap break-words rounded-md bg-slate-900 p-2 text-[11px] text-slate-100">
                          <code>{capture.submittedCode}</code>
                        </pre>
                      ) : null}
                      {capture.completion ? (
                        <pre className="whitespace-pre-wrap break-words rounded-md bg-emerald-950 p-2 text-[11px] text-emerald-100">
                          <code>{capture.completion}</code>
                        </pre>
                      ) : null}
                    </div>
                  )}
                  <p className="mt-2 text-xs text-slate-500">{capture.createdAt}</p>
                  <p className="text-xs text-slate-500">Source: {capture.source}</p>
                  <AnalysisOutput text={capture.analysis} />
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
