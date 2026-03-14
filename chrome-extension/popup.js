const statusEl = document.getElementById('status');
const apiBaseEl = document.getElementById('apiBase');
const usernameEl = document.getElementById('username');
const passwordEl = document.getElementById('password');
const saveConfigBtn = document.getElementById('saveConfig');
const startAgentBtn = document.getElementById('startAgent');
const stopAgentBtn = document.getElementById('stopAgent');

const setStatus = (message) => {
  statusEl.textContent = message;
};

const updateButtons = (isRunning) => {
  startAgentBtn.disabled = isRunning;
  stopAgentBtn.disabled = !isRunning;
};

const getFormValues = () => {
  const apiBase = apiBaseEl.value.trim().replace(/\/$/, '');
  const username = usernameEl.value.trim();
  const password = passwordEl.value;

  return { apiBase, username, password };
};

const validateRequiredValues = ({ apiBase, username, password }) => {
  if (!apiBase || !username || !password) {
    throw new Error('API Base, Username, and Password are required.');
  }
};

const persistForm = async () => {
  await chrome.storage.local.set(getFormValues());
};

const loadSettings = async () => {
  const { apiBase, username, password, pollingEnabled, lastStatus } = await chrome.storage.local.get([
    'apiBase',
    'username',
    'password',
    'pollingEnabled',
    'lastStatus',
  ]);

  apiBaseEl.value = apiBase || 'http://localhost:3000';
  usernameEl.value = username || 'proctor';
  passwordEl.value = password || 'proctor123';

  updateButtons(Boolean(pollingEnabled));
  setStatus(lastStatus || 'Set config, then click Start Background.');
};

const refreshRuntimeState = async () => {
  const { pollingEnabled, lastStatus } = await chrome.storage.local.get([
    'pollingEnabled',
    'lastStatus',
  ]);

  updateButtons(Boolean(pollingEnabled));
  if (lastStatus) {
    setStatus(lastStatus);
  }
};

saveConfigBtn.addEventListener('click', async () => {
  try {
    const values = getFormValues();
    validateRequiredValues(values);
    await chrome.storage.local.set(values);
    setStatus('Config saved.');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Failed to save config.');
  }
});

startAgentBtn.addEventListener('click', async () => {
  try {
    const values = getFormValues();
    validateRequiredValues(values);

    await chrome.storage.local.set({
      ...values,
      authToken: '',
      pollingEnabled: true,
      lastStatus: `[${new Date().toLocaleTimeString()}] Background agent start requested.`,
    });

    updateButtons(true);
    setStatus('Background agent start requested.');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Failed to start background agent.');
  }
});

stopAgentBtn.addEventListener('click', async () => {
  try {
    await chrome.storage.local.set({
      pollingEnabled: false,
      lastStatus: `[${new Date().toLocaleTimeString()}] Background agent stopped.`,
    });

    updateButtons(false);
    setStatus('Background agent stopped.');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Failed to stop background agent.');
  }
});

[apiBaseEl, usernameEl, passwordEl].forEach((element) => {
  element.addEventListener('input', () => {
    persistForm().catch(() => {
      setStatus('Could not auto-save config.');
    });
  });
});

loadSettings()
  .then(() => refreshRuntimeState())
  .catch(() => {
    setStatus('Could not load settings.');
  });

window.setInterval(() => {
  refreshRuntimeState().catch(() => {
    // keep popup responsive
  });
}, 1500);
