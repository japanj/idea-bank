import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { SYSTEM } from '$lib/prompt.js';

export async function POST({ request }) {
  const { idea, profile, others } = await request.json();
  if (!idea?.id || !idea?.title || !Array.isArray(others)) {
    return json({ error: 'A complete idea and comparison list are required.' }, { status: 400 });
  }

  if (!env.GEMINI_API_KEY) return json({ error: 'Set GEMINI_API_KEY in .env' }, { status: 500 });
  const model = env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  const user = `PROFILE:\n${JSON.stringify(profile)}\n\nOTHER IDEAS (reference only; do not evaluate these):\n${others.map((other) => `- ${other.title}`).join('\n') || 'none'}\n\nCANDIDATE IDEA (evaluate this one only):\nID: ${idea.id}\nTitle: ${idea.title}\nDescription: ${idea.description}`;

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0, seed: 42, responseMimeType: 'application/json' }
    })
  });

  if (!r.ok) {
    const status = r.status === 429 ? 429 : 502;
    const msg = r.status === 429 ? 'Rate limit reached. Wait a minute and try again.' : (await r.text()).slice(0, 300);
    return json({ error: msg }, { status });
  }

  try {
    const d = await r.json();
    const text = d.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return json({ error: 'The model returned no answer (possibly blocked). Try rewording the idea.' }, { status: 502 });
    let result;
    try { result = JSON.parse(text); } catch { return json({ error: 'Model returned invalid JSON. Try again.' }, { status: 502 }); }
    const evaluated = result.evaluated_idea;
    if (evaluated?.id !== idea.id) {
      return json({ error: 'The model evaluated a different idea. Please try again.' }, { status: 502 });
    }
    return json({ ...result, idea_id: idea.id });
  } catch {
    const ok = result.scores && Array.isArray(result.components) && result.components.length && Array.isArray(result.recommended_stack) && Array.isArray(result.new_skills_needed) && Array.isArray(result.dependencies) && result.reasoning && typeof result.total_effort_days === 'number';
    if (!ok) return json({ error: 'Model response was incomplete. Try again.' }, { status: 502 });
    return json({ error: 'Model returned invalid JSON. Try again.' }, { status: 502 });
  }
}
