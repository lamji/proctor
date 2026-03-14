# Proctor AI VS Code Extension (Local)

## What it does

- You highlight code in the editor.
- Press `Ctrl+T` (`Cmd+T` on macOS).
- Extension sends the selected code to your Next.js server.
- AI completion happens on the server.
- Result appears in your Next.js proctor dashboard feed.

This extension does **not** insert completion into VS Code.

## Setup

1. In VS Code, open `Extensions` view.
2. Use `Developer: Install Extension from Location...` and select `vscode-extension/`.
3. Run command: `Proctor AI: Configure Server`
4. Set API base and credentials (same as your Next.js proctor login).

## Usage

1. Highlight code.
2. Press `Ctrl+T` (`Cmd+T` on macOS).
3. Open your Next.js dashboard to view AI completion output.

## Notes

- Requires your Next.js app server to be running.
- Uses `/api/proctor/auth/login` then bearer token auth.
