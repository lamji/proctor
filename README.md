# Exam Proctor Capture Prototype

This project is a Next.js + Chrome extension prototype for instructor-triggered capture.

Flow implemented:
1. Instructor logs in with env-backed test credentials in Next.js.
2. Instructor sends `capture_now` command.
3. Chrome extension logs in with same credentials and polls command endpoint in background.
4. Extension captures the currently active tab on command and uploads image.
5. Next.js dashboard lists uploaded frames with AI analysis text.

## Run the Next.js app

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## PWA support

The app includes a baseline PWA setup:
- Web app manifest via `app/manifest.ts`
- Service worker at `public/sw.js`
- Client-side service worker registration in `components/pwa-registration.tsx`

To test installability:
1. Run a production build:
   ```bash
   npm run build
   npm run start
   ```
2. Open `http://localhost:3000` in Chrome (mobile emulator or Android).
3. Check DevTools -> Application:
   - Manifest is valid
   - Service Worker is active
4. Use "Install" from the browser menu.

## API Endpoints

- `POST /api/proctor/auth/login` -> login with username/password
- `GET /api/proctor/state` -> get global queue + captures
- `POST /api/proctor/command` -> queue `capture_now`
- `GET /api/proctor/command/pull` -> extension pulls next command
- `POST /api/proctor/capture` -> extension uploads capture image data URL

Note: queue and captures are stored in memory (`lib/proctor-global-store.ts`) and reset when server restarts.

## Load the Chrome extension

1. Open Chrome -> `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder: `chrome-extension/`

Then:
1. Configure test credentials in `.env.local` (see below).
2. Login in Next.js UI using those credentials.
3. Open extension popup, set API base (e.g. `http://localhost:3000`), username, and password.
4. Click **Start Background** in the extension popup.
6. Go to the tab you want to monitor.
7. Back in Next.js UI, click **Capture Now**.

## AI analysis options

Set one of these server-side integrations:

- `GROQ_API_KEY` (recommended) and `GROQ_VISION_MODEL` (optional, default: `meta-llama/llama-4-scout-17b-16e-instruct`)
- `PROCTOR_AI_MODE` (optional: `proctor` or `solve_test`)
- `PROCTOR_AI_PROMPT` (optional general prompt, mainly for proctor mode)
- `PROCTOR_AI_PROCTOR_PROMPT` (optional explicit prompt for proctor mode)
- `PROCTOR_AI_SOLVE_PROMPT` (optional explicit prompt for solve_test mode)
- `PROCTOR_AI_INCLUDE_TECH_KNOWLEDGE` (optional, default `true`; injects official React Native/React/Node/Express/TypeScript/PHP/SQL guidance into solve prompts)
- `PROCTOR_AI_KNOWLEDGE_TOPICS` (optional comma-separated filter, e.g. `react-native,react,node.js,express.js,typescript,php,sql`)
- `PROCTOR_AI_MAX_OUTPUT_TOKENS` (optional, default `900`, max `4000`)
- `AI_ANALYSIS_ENDPOINT` (optional webhook) and `AI_ANALYSIS_BEARER_TOKEN` (optional)
- `PROCTOR_TEST_USERNAME` and `PROCTOR_TEST_PASSWORD` for login
- `PROCTOR_TEST_AUTH_SECRET` (optional token-signing secret)
- `PROCTOR_DEBUG_LOGS` (optional, set `false` to disable server logs)

Example `.env.local`:

```bash
GROQ_API_KEY=your_groq_api_key_here
GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
PROCTOR_AI_MODE=solve_test
PROCTOR_AI_SOLVE_PROMPT=Solve the problem shown in the screenshot and provide final answer plus short explanation.
PROCTOR_AI_INCLUDE_TECH_KNOWLEDGE=true
PROCTOR_AI_KNOWLEDGE_TOPICS=react-native,react,node.js,express.js,typescript,php,sql
PROCTOR_AI_MAX_OUTPUT_TOKENS=1200
PROCTOR_TEST_USERNAME=proctor
PROCTOR_TEST_PASSWORD=proctor123
PROCTOR_TEST_AUTH_SECRET=super-secret-for-testing
PROCTOR_DEBUG_LOGS=true
PROCTOR_AI_PROMPT=You are an exam proctor assistant. Detect suspicious coding-help behavior and summarize in <=120 words.
```

If no AI integration is configured, the app stores a fallback analysis message.

## Security Notes

- This is consent-based capture and does not bypass browser or OS capture restrictions.
- CORS is open (`*`) for local development. Lock this down before production.
- Testing flow now uses env-backed login credentials instead of session/token fields.
