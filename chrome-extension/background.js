const POLL_ALARM = 'proctor_poll_alarm';
const POLL_INTERVAL_MS = 2500;
const POLL_INTERVAL_MINUTES = 0.5;

let pollInFlight = false;
let softPollTimer = null;

const setStatus = async (message) => {
  const stamped = `[${new Date().toLocaleTimeString()}] ${message}`;
  await chrome.storage.local.set({ lastStatus: stamped });
};

const getConfig = async () => {
  const data = await chrome.storage.local.get([
    'apiBase',
    'username',
    'password',
    'authToken',
    'pollingEnabled',
  ]);

  return {
    apiBase: (data.apiBase || '').replace(/\/$/, ''),
    username: data.username || '',
    password: data.password || '',
    authToken: data.authToken || '',
    pollingEnabled: Boolean(data.pollingEnabled),
  };
};

const hasValidConfig = (config) => Boolean(config.apiBase && config.username && config.password);

const login = async (config) => {
  const response = await fetch(`${config.apiBase}/api/proctor/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: config.username,
      password: config.password,
    }),
  });

  const payload = await response.json();
  if (!response.ok || !payload.ok || !payload.token) {
    throw new Error(payload.error || 'Extension login failed.');
  }

  await chrome.storage.local.set({ authToken: payload.token });
  return payload.token;
};

const ensureAuthToken = async (config) => {
  if (config.authToken) {
    return config.authToken;
  }

  return login(config);
};

const authFetch = async ({ path, method, config, body }) => {
  let token = await ensureAuthToken(config);

  const runRequest = async (authToken) => {
    const response = await fetch(`${config.apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${authToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body } : {}),
      cache: 'no-store',
    });

    return response;
  };

  let response = await runRequest(token);

  if (response.status === 401) {
    token = await login(config);
    response = await runRequest(token);
  }

  return response;
};

const isCapturableUrl = (url) => {
  if (!url || typeof url !== 'string') {
    return false;
  }

  return (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('file://')
  );
};

const captureCurrentTab = async () => {
  let [activeTab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });

  if (!activeTab) {
    [activeTab] = await chrome.tabs.query({
      active: true,
    });
  }

  if (!activeTab || activeTab.windowId === undefined) {
    throw new Error('No active tab found to capture.');
  }

  if (!isCapturableUrl(activeTab.url)) {
    throw new Error(
      `Active tab URL is not capturable (${activeTab.url || 'unknown'}). Switch to a normal website tab.`,
    );
  }

  const imageDataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, {
    format: 'jpeg',
    quality: 82,
  });

  if (!imageDataUrl || !imageDataUrl.startsWith('data:image/')) {
    throw new Error('Failed to capture the active tab.');
  }

  return imageDataUrl;
};

const requeueCaptureCommand = async (config) => {
  const response = await authFetch({
    path: '/api/proctor/command',
    method: 'POST',
    config,
    body: JSON.stringify({ type: 'capture_now' }),
  });

  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || 'Failed to re-queue capture command.');
  }
};

const pullCommand = async (config) => {
  const response = await authFetch({
    path: '/api/proctor/command/pull',
    method: 'GET',
    config,
  });

  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || 'Failed to pull command.');
  }

  return payload.command || null;
};

const uploadCapture = async ({ config, imageDataUrl }) => {
  const response = await authFetch({
    path: '/api/proctor/capture',
    method: 'POST',
    config,
    body: JSON.stringify({
      imageDataUrl,
      source: 'tab',
    }),
  });

  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || 'Failed to upload capture.');
  }
};

const pollOnce = async () => {
  if (pollInFlight) {
    return;
  }

  pollInFlight = true;

  try {
    const config = await getConfig();
    if (!config.pollingEnabled) {
      return;
    }

    if (!hasValidConfig(config)) {
      await setStatus('Background running, but config is incomplete.');
      return;
    }

    const command = await pullCommand(config);

    if (command?.type === 'capture_now') {
      try {
        await setStatus('Capture command received. Capturing current tab...');
        const imageDataUrl = await captureCurrentTab();
        await uploadCapture({ config, imageDataUrl });
        await setStatus('Current tab captured and uploaded.');
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown capture error.';
        console.error('[PROCTOR_EXT] capture pipeline failed:', reason);

        try {
          await requeueCaptureCommand(config);
          await setStatus(`Capture failed (${reason}). Command re-queued.`);
        } catch (requeueError) {
          const requeueReason =
            requeueError instanceof Error ? requeueError.message : 'Unknown re-queue error.';
          await setStatus(`Capture failed (${reason}). Re-queue failed: ${requeueReason}`);
        }
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown background error.';
    console.error('[PROCTOR_EXT] background poll error:', reason);
    await setStatus(`Background error: ${reason}`);
  } finally {
    pollInFlight = false;
  }
};

const startSoftPollingLoop = () => {
  if (softPollTimer) {
    clearTimeout(softPollTimer);
  }

  const tick = async () => {
    const config = await getConfig();
    if (!config.pollingEnabled) {
      return;
    }

    await pollOnce();
    softPollTimer = setTimeout(() => {
      tick().catch(() => {
        // ignored
      });
    }, POLL_INTERVAL_MS);
  };

  softPollTimer = setTimeout(() => {
    tick().catch(() => {
      // ignored
    });
  }, POLL_INTERVAL_MS);
};

const stopSoftPollingLoop = () => {
  if (softPollTimer) {
    clearTimeout(softPollTimer);
    softPollTimer = null;
  }
};

const resumeIfNeeded = async () => {
  const { pollingEnabled } = await chrome.storage.local.get(['pollingEnabled']);
  if (!pollingEnabled) {
    return;
  }

  await chrome.alarms.create(POLL_ALARM, { periodInMinutes: POLL_INTERVAL_MINUTES });
  startSoftPollingLoop();
  await setStatus('Background agent resumed.');
};

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes.pollingEnabled) {
    return;
  }

  (async () => {
    const pollingEnabled = Boolean(changes.pollingEnabled.newValue);

    if (pollingEnabled) {
      await chrome.alarms.create(POLL_ALARM, { periodInMinutes: POLL_INTERVAL_MINUTES });
      startSoftPollingLoop();
      await setStatus('Background agent started. Waiting for capture commands...');
      await pollOnce();
      return;
    }

    await chrome.alarms.clear(POLL_ALARM);
    stopSoftPollingLoop();
    await setStatus('Background agent stopped.');
  })().catch(() => {
    // ignored
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== POLL_ALARM) {
    return;
  }

  pollOnce().catch(() => {
    // ignored
  });
});

chrome.runtime.onInstalled.addListener(() => {
  resumeIfNeeded().catch(() => {
    // ignored
  });
});

chrome.runtime.onStartup.addListener(() => {
  resumeIfNeeded().catch(() => {
    // ignored
  });
});

resumeIfNeeded().catch(() => {
  // ignored
});
