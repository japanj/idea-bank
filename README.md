# Idea bank
1. `npm install`
2. `cp .env.example .env` and add a free Gemini key from aistudio.google.com
3. `npm run dev`

Ideas and profile are stored in your browser (localStorage). Edit the rubric in `src/lib/prompt.js`, weights in `priority()` in `src/routes/+page.svelte`.
To use Claude instead, replace the fetch in `src/routes/api/score/+server.js`.
