/* eslint-disable @typescript-eslint/no-require-imports */
const vscode = require('vscode');
const http = require('node:http');
const https = require('node:https');

const KEYS = {
  apiBase: 'proctor.apiBase',
  username: 'proctor.username',
  password: 'proctor.password',
  authToken: 'proctor.authToken',
};
const DEFAULT_DEV_API_BASE = 'http://localhost:3000';
const DEFAULT_PROD_API_BASE = 'https://proctor-phi.vercel.app';

const getDefaultApiBase = () =>
  process.env.NODE_ENV === 'development' ? DEFAULT_PROD_API_BASE : DEFAULT_PROD_API_BASE;

const requestJson = ({ url, method, headers = {}, body }) =>
  new Promise((resolve, reject) => {
    const target = new URL(url);
    const client = target.protocol === 'https:' ? https : http;

    const payload = body ? JSON.stringify(body) : null;

    const req = client.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method,
        headers: {
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk.toString();
        });
        res.on('end', () => {
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            // ignore JSON parse failure
          }

          resolve({
            status: res.statusCode || 0,
            json,
            text: raw,
          });
        });
      },
    );

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });

const normalizeBase = (value) => value.trim().replace(/\/$/, '');

const ensureConfig = async (context) => {
  let apiBase = context.globalState.get(KEYS.apiBase) || '';
  let username = context.globalState.get(KEYS.username) || '';
  let password = context.globalState.get(KEYS.password) || '';

  if (!apiBase) {
    const input = await vscode.window.showInputBox({
      prompt: 'Proctor API Base URL',
      value: getDefaultApiBase(),
      ignoreFocusOut: true,
    });
    if (!input) {
      throw new Error('API base is required.');
    }
    apiBase = normalizeBase(input);
  }

  if (!username) {
    const input = await vscode.window.showInputBox({
      prompt: 'Proctor username',
      value: 'proctor',
      ignoreFocusOut: true,
    });
    if (!input) {
      throw new Error('Username is required.');
    }
    username = input.trim();
  }

  if (!password) {
    const input = await vscode.window.showInputBox({
      prompt: 'Proctor password',
      value: 'proctor123',
      password: true,
      ignoreFocusOut: true,
    });
    if (!input) {
      throw new Error('Password is required.');
    }
    password = input;
  }

  await context.globalState.update(KEYS.apiBase, apiBase);
  await context.globalState.update(KEYS.username, username);
  await context.globalState.update(KEYS.password, password);

  return { apiBase, username, password };
};

const login = async (context, config) => {
  const response = await requestJson({
    url: `${config.apiBase}/api/proctor/auth/login`,
    method: 'POST',
    body: {
      username: config.username,
      password: config.password,
    },
  });

  if (response.status !== 200 || !response.json || !response.json.ok || !response.json.token) {
    const reason = response.json?.error || response.text || 'Login failed';
    throw new Error(reason);
  }

  await context.globalState.update(KEYS.authToken, response.json.token);
  return response.json.token;
};

const sendSelectionToServer = async (context) => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    throw new Error('Open a file first.');
  }

  const config = await ensureConfig(context);
  let authToken = context.globalState.get(KEYS.authToken) || '';

  if (!authToken) {
    authToken = await login(context, config);
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    throw new Error('Highlight code first, then press Ctrl+T.');
  }

  const selectedCode = editor.document.getText(selection).trim();
  if (!selectedCode) {
    throw new Error('Selected code is empty.');
  }

  const doRequest = async (token) =>
    requestJson({
      url: `${config.apiBase}/api/proctor/code/complete`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: {
        promptComment: '',
        currentCode: selectedCode,
        language: editor.document.languageId,
      },
    });

  let response = await doRequest(authToken);

  if (response.status === 401) {
    authToken = await login(context, config);
    response = await doRequest(authToken);
  }

  if (response.status !== 200 || !response.json || !response.json.ok) {
    const reason = response.json?.error || response.text || 'Completion request failed';
    throw new Error(reason);
  }

  // Silent success by request: no info popup on send.
};

const configure = async (context) => {
  await context.globalState.update(KEYS.authToken, '');
  await ensureConfig(context);
  vscode.window.showInformationMessage('Proctor AI configuration saved.');
};

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('proctorAi.configure', () => configure(context)),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('proctorAi.sendSelectionToServer', async () => {
      try {
        await sendSelectionToServer(context);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown send error';
        vscode.window.showErrorMessage(`Proctor AI error: ${reason}`);
      }
    }),
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
