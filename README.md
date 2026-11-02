# Idea bank
1. `npm install`
2. `cp .env.example .env` and add a Gemini key from aistudio.google.com
3. `npm run dev`

Ideas and profile are stored in browser (localStorage). Edit the promt in `src/lib/prompt.js`, weights in `priority()` in `src/routes/+page.svelte`.
To use other AIs instead, replace the fetch in `src/routes/api/score/+server.js`.
