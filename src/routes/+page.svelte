<script>
  import { onMount } from 'svelte';

  let ideas = $state([]);
  let profile = $state({ level: 'Intermediate', skills: '', hours: 10, budget: 'Free tiers only' }); //default value
  let loaded = $state(false);
  let showAdd = $state(false);
  let showProfile = $state(false);
  let busy = $state(false);
  let open = $state(null);
  let draft = $state({ title: '', description: '' });

  onMount(() => {
    try {
      ideas = JSON.parse(localStorage.getItem('ideas') || '[]');
      profile = { ...profile, ...JSON.parse(localStorage.getItem('profile') || '{}') };
    } catch {}
    loaded = true;
  });

  $effect(() => {
    if (!loaded) return;
    localStorage.setItem('ideas', JSON.stringify(ideas));
    localStorage.setItem('profile', JSON.stringify(profile));
  });

  const priority = (s) => 0.3 * s.demand + 0.25 * s.speed + 0.25 * s.fit + 0.2 * s.interest;
  const ranked = $derived(
    ideas
      .filter((i) => i.result && (!i.result.idea_id || i.result.idea_id === i.id))
      .toSorted((a, b) => priority(b.result.scores) - priority(a.result.scores))
  );
  const days = (r) => Math.round(r.total_effort_days * 1.5);

  let importMsg = $state('');
  let fileEl;
  const validResult = (r) =>
    r && r.scores && r.reasoning &&
    ['components', 'recommended_stack', 'new_skills_needed', 'dependencies'].every((k) => Array.isArray(r[k]));

  function exportData() {
    const data = { app: 'idea-bank', version: 1, exportedAt: new Date().toISOString(), profile, ideas };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `idea-bank-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importData(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.ideas)) throw new Error('no ideas found in file');
      const incoming = data.ideas
        .filter((i) => i && typeof i.title === 'string')
        .map((i) => ({
          id: i.id || crypto.randomUUID(),
          title: i.title,
          description: i.description || '',
          result: validResult(i.result) ? i.result : null
        }));
      const byId = new Map(ideas.map((i) => [i.id, i]));
      let added = 0;
      for (const i of incoming) {
        if (byId.has(i.id)) Object.assign(byId.get(i.id), i);
        else { ideas.push(i); added++; }
      }
      if (data.profile) profile = { ...profile, ...data.profile };
      importMsg = `Imported: ${added} new, ${incoming.length - added} updated.`;
    } catch (err) {
      importMsg = 'Import failed: ' + err.message;
    }
  }

  function addIdea() {
    if (!draft.title.trim()) return;
    ideas.push({ id: crypto.randomUUID(), ...draft });
    draft = { title: '', description: '' };
    showAdd = false;
  }

  async function prioritize() {
    showProfile = false;
    busy = true;
    const queue = ideas.map(({ id, title, description }) => ({ id, title, description }));
    for (const candidate of queue) {
      const idea = ideas.find((item) => item.id === candidate.id);
      if (!idea) continue;
      idea.error = null;
      try {
        const res = await fetch('/api/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idea: candidate,
            profile,
            others: queue.filter((item) => item.id !== candidate.id).map(({ title }) => ({ title }))
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        const currentIdea = ideas.find((item) => item.id === candidate.id);
        if (currentIdea) currentIdea.result = data;
      } catch (e) {
        const currentIdea = ideas.find((item) => item.id === candidate.id);
        if (currentIdea) currentIdea.error = e.message;
      }
    }
    busy = false;
  }
</script>

<main>
  <header class="masthead">
    <a class="wordmark" href="/" aria-label="Idea bank home">idea bank<span>·</span></a>
    <div class="masthead-copy">
      <p class="eyebrow">Personal project finder</p>
      <!-- <p>Capture possibilities. Choose deliberately.</p> -->
    </div>
    <div class="utilities" aria-label="Data tools">
      <button class="text-button" disabled={!ideas.length} onclick={exportData}>Export</button>
      <button class="text-button" onclick={() => fileEl.click()}>Import</button>
      <input type="file" accept=".json,application/json" hidden bind:this={fileEl} onchange={importData} />
    </div>
  </header>

  {#if importMsg}<p class="notice" role="status">{importMsg}</p>{/if}

  <div class="desk">
    <section class="decision-panel" aria-labelledby="decision-heading">
      <div class="section-heading decision-heading">
        <div>
          <p class="eyebrow">Decision desk</p>
          <h1 id="decision-heading">What you can start next week!</h1>
        </div>
        <button class="primary-button" disabled={busy || !ideas.length} onclick={() => (showProfile = true)}>
          {busy ? 'Scoring ideas…' : 'Prioritize ideas'}
        </button>
      </div>

      {#if busy}
        <div class="thinking-state" role="status">
          <span class="spinner"></span>
          <div><strong>Looking for the strongest bet</strong><p>Comparing demand, fit, speed, and interest across your ideas.</p></div>
        </div>
      {:else if ranked.length}
        <div class="ranked-list">
          {#each ranked as idea, n (idea.id)}
            {@const r = idea.result}
            <article class:top-pick={n === 0} class="ranking">
              <button class="ranking-trigger" onclick={() => (open = open === idea.id ? null : idea.id)} aria-expanded={open === idea.id}>
                <span class="rank-number">{String(n + 1).padStart(2, '0')}</span>
                <span class="ranking-content">
                  {#if n === 0}<span class="recommendation">Recommended next</span>{/if}
                  <strong>{idea.title}</strong>
                  {#if idea.description}<span class="idea-summary">{idea.description}</span>{/if}
                  <span class="effort">About {days(r)} days{#if r.total_effort_days <= 10} · quick win{/if}</span>
                </span>
                <span class="score-block"><span>score / 5</span><b>{priority(r.scores).toFixed(1)}</b></span>
                <span class:open={open === idea.id} class="disclosure" aria-hidden="true">↓</span>
              </button>

              {#if open === idea.id}
                <div class="score-detail">
                  <div class="score-readout" aria-label="Score breakdown">
                    <span><b>{r.scores.demand} / 5</b> Demand</span>
                    <span><b>{r.scores.fit} / 5</b> Fit</span>
                    <span><b>{r.scores.speed} / 5</b> Speed</span>
                    <span><b>{r.scores.interest} / 5</b> Interest</span>
                  </div>
                  <div class="detail-grid">
                    <p><b>Why it ranks</b>{r.reasoning.overall}</p>
                    <p><b>Riskiest part</b>{r.riskiest_part}</p>
                    {#if r.new_skills_needed.length}<p><b>New skills</b>{r.new_skills_needed.join(', ')}</p>{/if}
                    {#if r.dependencies.length}<p><b>Depends on</b>{r.dependencies.join(', ')}</p>{/if}
                    <p><b>Suggested stack</b>{r.recommended_stack.join(', ')}</p>
                  </div>
                  {#if r.components.length}
                    <ul class="effort-list" aria-label="Component effort">
                      {#each r.components as c}<li><span>{c.name}</span><span>{c.effort_days}d · {c.familiarity}</span></li>{/each}
                    </ul>
                  {/if}
                </div>
              {/if}
            </article>
          {/each}
        </div>
      {:else}
        <div class="decision-empty">
          <!-- <span class="empty-mark">01</span> -->
          <h2>Your next project is waiting for you to pick up.</h2>
          <p>Add your project idea to your box, then let AI help to prioritize them against your time, skills, and budget.</p>
        </div>
      {/if}
    </section>

    <aside class="inbox-panel" aria-labelledby="inbox-heading">
      <div class="section-heading inbox-heading">
        <div><p class="eyebrow">Idea box</p><h2 id="inbox-heading">{ideas.length} {ideas.length === 1 ? 'idea' : 'ideas'} </h2></div>
        <button class="add-button" onclick={() => (showAdd = !showAdd)} aria-expanded={showAdd} aria-controls="idea-form">{showAdd ? 'Close' : 'Add idea'} <span aria-hidden="true">{showAdd ? '×' : '+'}</span></button>
      </div>

      {#if showAdd}
        <form id="idea-form" class="idea-form" onsubmit={(event) => { event.preventDefault(); addIdea(); }}>
          <label>Idea title<input placeholder="A concise project name" bind:value={draft.title} /></label>
          <label>What is it, and who is it for?<textarea rows="4" placeholder="A helpful sentence is enough." bind:value={draft.description}></textarea></label>
          <button class="save-button" type="submit">Save to box <span aria-hidden="true">→</span></button>
        </form>
      {/if}

      <div class="idea-list">
        {#each ideas as idea, n (idea.id)}
          <article class="idea-row">
            <span class="idea-index">{String(n + 1).padStart(2, '0')}</span>
            <div><strong>{idea.title}</strong>{#if idea.description}<p>{idea.description}</p>{/if}{#if idea.error}<p class="error">Couldn’t score: {idea.error}</p>{/if}</div>
            <button class="delete-button" onclick={() => (ideas = ideas.filter((i) => i.id !== idea.id))} aria-label={`Delete ${idea.title}`}>×</button>
          </article>
        {:else}
          <div class="inbox-empty"><span>+</span><p>No ideas yet.<br />Start add some random ideas.</p></div>
        {/each}
      </div>
    </aside>
  </div>
</main>

{#if showProfile}
  <div class="backdrop" role="presentation" onclick={() => (showProfile = false)}>
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="profile-heading" onclick={(event) => event.stopPropagation()}>
      <button class="close-button" onclick={() => (showProfile = false)} aria-label="Close profile">×</button>
      <p class="eyebrow">Calibration</p>
      <h2 id="profile-heading">Set the limits of your next project.</h2>
      <p class="modal-intro">The desk uses this to make the ranking useful for your real week, not an imaginary one.</p>
      <div class="profile-fields">
        <label>Tech level<select bind:value={profile.level}><option>Beginner</option><option>Intermediate</option><option>Professional</option></select></label>
        <label>Hours per week<input type="number" min="1" bind:value={profile.hours} /></label>
        <label class="full-field">Skills and tools you know<textarea rows="3" placeholder="SvelteKit, Python, GIS, Supabase…" bind:value={profile.skills}></textarea></label>
        <label class="full-field">Budget<input bind:value={profile.budget} /></label>
      </div>
      <button class="primary-button modal-action" onclick={prioritize}>Find my strongest bet <span aria-hidden="true">→</span></button>
    </section>
  </div>
{/if}

<style>
  :global(*) { box-sizing: border-box; }
  :global(body) { margin: 0; color: #18251f; background: #f6f4ef; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  :global(button), :global(input), :global(textarea), :global(select) { font: inherit; }
  :global(button) { -webkit-tap-highlight-color: transparent; }

  main { max-width: 1380px; min-height: 100vh; margin: 0 auto; padding: 0 32px 52px; }
  .masthead { min-height: 88px; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 32px; border-bottom: 1px solid #d9ddd5; }
  .wordmark { color: inherit; font: 700 1.25rem/1 Georgia, "Times New Roman", serif; letter-spacing: -.055em; text-decoration: none; }
  .wordmark span { color: #e3ae3d; }
  .masthead-copy { display: flex; align-items: baseline; gap: 14px; color: #66736a; font-size: .82rem; }
  .masthead-copy p { margin: 0; }
  .eyebrow { margin: 0 0 5px; color: #728077; font-size: .68rem; font-weight: 750; letter-spacing: .13em; line-height: 1.1; text-transform: uppercase; }
  .masthead-copy .eyebrow { margin: 0; color: #1f5c45; }
  .utilities { display: flex; gap: 14px; }
  .text-button, .delete-button, .close-button { color: #526158; border: 0; background: transparent; cursor: pointer; }
  .text-button { padding: 7px 0; font-size: .83rem; text-decoration: underline; text-underline-offset: 3px; }
  .text-button:disabled { cursor: not-allowed; opacity: .4; }
  .notice { width: fit-content; margin: 18px 0 0 auto; padding: 8px 11px; color: #285640; background: #dbe8de; border-radius: 8px; font-size: .8rem; }

  .desk { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(300px, .8fr); gap: 44px; padding-top: 48px; }
  .decision-panel { min-width: 0; }
  .inbox-panel { min-width: 0; padding-left: 34px; border-left: 1px solid #d9ddd5; }
  .section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; }
  h1, h2, p { margin-top: 0; }
  h1, h2 { font-family: Georgia, "Times New Roman", serif; font-weight: 600; letter-spacing: -.042em; }
  h2 { color: #d2a437;}
  h1 { max-width: 570px; margin-bottom: 0; font-size: clamp(2.45rem, 4vw, 4.45rem); line-height: .99; }
  .inbox-heading h2 { margin: 0; font-size: 1.45rem; line-height: 1.05; }
  .primary-button, .save-button, .add-button { cursor: pointer; border: 1px solid transparent; font-weight: 700; transition: transform 180ms ease, background 180ms ease, border-color 180ms ease; }
  .primary-button { flex: 0 0 auto; padding: 12px 16px; color: #f8f6f0; background: #1f5c45; border-radius: 10px; box-shadow: 0 3px 0 #143d2e; font-size: .88rem; }
  .primary-button:hover:not(:disabled), .save-button:hover, .add-button:hover { transform: translateY(-2px); }
  .primary-button:active:not(:disabled), .save-button:active, .add-button:active { transform: translateY(1px); }
  .primary-button:disabled { cursor: not-allowed; opacity: .48; box-shadow: none; }
  .add-button { padding: 8px 0; color: #1f5c45; background: transparent; border-bottom-color: #7b9989; font-size: .82rem; }
  .add-button span { margin-left: 5px; font-size: 1.1rem; }

  .ranked-list { margin-top: 42px; border-top: 1px solid #b9c3bb; }
  .ranking { border-bottom: 1px solid #cfd5cf; }
  .ranking-trigger { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto 22px; align-items: center; width: 100%; gap: 16px; padding: 21px 4px 20px 0; color: inherit; text-align: left; border: 0; background: transparent; cursor: pointer; transition: background 180ms ease, padding 180ms ease; }
  .ranking-trigger:hover { background: #eeefe9; padding-left: 12px; padding-right: 12px; }
  .ranking.top-pick { background: #dbe8de; border-color: #bad1c0; }
  .top-pick .ranking-trigger { min-height: 175px; padding: 26px 22px; }
  .top-pick .ranking-trigger:hover { padding-left: 30px; padding-right: 14px; }
  .rank-number { align-self: start; color: #7b877e; font-family: Georgia, "Times New Roman", serif; font-size: 1.15rem; }
  .top-pick .rank-number { color: #1f5c45; font-size: 2.65rem; line-height: .9; }
  .ranking-content { display: grid; gap: 5px; min-width: 0; }
  .ranking-content strong { overflow-wrap: anywhere; font-family: Georgia, "Times New Roman", serif; font-size: 1.25rem; letter-spacing: -.028em; line-height: 1.1; }
  .top-pick .ranking-content strong { font-size: clamp(1.65rem, 2.7vw, 2.65rem); }
  .recommendation { color: #1f5c45; font-size: .67rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
  .idea-summary { max-width: 640px; color: #59685f; font-size: .88rem; line-height: 1.45; }
  .effort { color: #68776d; font-size: .74rem; font-weight: 650; }
  .score-block { display: grid; justify-items: end; min-width: 53px; color: #54645a; }
  .score-block span { font-size: .6rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
  .score-block b { color: #1f5c45; font-family: Georgia, "Times New Roman", serif; font-size: 1.9rem; line-height: 1; }
  .top-pick .score-block b { font-size: 2.5rem; }
  .disclosure { color: #607166; font-size: 1.2rem; transition: transform 220ms ease; }
  .disclosure.open { transform: rotate(180deg); }
  .score-detail { padding: 0 22px 26px 94px; animation: reveal 220ms ease-out both; }
  .score-readout { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 22px; padding: 12px 0; border-top: 1px solid #b8c7bb; border-bottom: 1px solid #b8c7bb; }
  .score-readout span { display: grid; gap: 2px; color: #54645a; font-size: .68rem; text-transform: uppercase; letter-spacing: .06em; }
  .score-readout b { color: #1f5c45; font-family: Georgia, "Times New Roman", serif; font-size: 1.25rem; }
  .detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 24px; }
  .detail-grid p { display: grid; gap: 4px; margin: 0; color: #526158; font-size: .82rem; line-height: 1.45; }
  .detail-grid b { color: #18251f; font-size: .68rem; letter-spacing: .08em; text-transform: uppercase; }
  .effort-list { margin: 20px 0 0; padding: 0; border-top: 1px solid #c6d1c8; list-style: none; }
  .effort-list li { display: flex; justify-content: space-between; gap: 18px; padding: 8px 0; border-bottom: 1px solid #c6d1c8; color: #536159; font-size: .76rem; }
  .effort-list li span:last-child { white-space: nowrap; }
  .thinking-state, .decision-empty { margin-top: 42px; }
  .thinking-state { display: flex; gap: 15px; align-items: center; padding: 28px; color: #3b5546; background: #dbe8de; }
  .thinking-state p { margin: 4px 0 0; font-size: .86rem; }
  .spinner { width: 26px; height: 26px; border: 3px solid #aac6b2; border-top-color: #1f5c45; border-radius: 50%; animation: spin 900ms linear infinite; }
  .decision-empty { max-width: 520px; padding: 38px 0; }
  /* .empty-mark { color: #d2a437; font: 600 4.5rem/.8 Georgia, "Times New Roman", serif; letter-spacing: -.08em; } */
  .decision-empty h2 { max-width: 410px; margin: 22px 0 13px; font-size: 2.15rem; line-height: 1.05; }
  .decision-empty p { max-width: 410px; color: #637168; font-size: .94rem; line-height: 1.55; }

  .idea-form { display: grid; gap: 14px; margin: 25px 0 20px; padding: 19px; background: #fdfcf9; border: 1px solid #d9ddd5; animation: reveal 200ms ease-out both; }
  label { display: grid; gap: 7px; color: #516057; font-size: .72rem; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; }
  input, textarea, select { width: 100%; color: #18251f; border: 1px solid #c8d0c8; border-radius: 7px; background: #fffefb; padding: 10px 11px; font-size: .88rem; font-weight: 450; letter-spacing: normal; text-transform: none; outline-color: #1f5c45; resize: vertical; }
  textarea { line-height: 1.45; }
  .save-button { justify-self: start; padding: 10px 12px; color: #1f5c45; background: #dbe8de; border-color: #bad1c0; border-radius: 8px; font-size: .8rem; }
  .save-button span { margin-left: 8px; }
  .idea-list { margin-top: 25px; border-top: 1px solid #cfd5cf; }
  .idea-row { display: grid; grid-template-columns: 26px minmax(0, 1fr) 24px; gap: 10px; align-items: start; padding: 17px 0; border-bottom: 1px solid #d9ddd5; }
  .idea-index { padding-top: 2px; color: #8a968d; font: .8rem Georgia, "Times New Roman", serif; }
  .idea-row strong { display: block; overflow-wrap: anywhere; font-size: .91rem; line-height: 1.25; }
  .idea-row p { margin: 5px 0 0; color: #68766d; font-size: .78rem; line-height: 1.45; }
  .idea-row .error { color: #a43427; }
  .delete-button { align-self: center; padding: 3px 0; font-size: 1.14rem; line-height: 1; opacity: .55; }
  .delete-button:hover { color: #9a3328; opacity: 1; }
  .inbox-empty { display: grid; justify-items: center; gap: 5px; padding: 54px 0; color: #78857c; text-align: center; }
  .inbox-empty span { color: #91a398; font-size: 2rem; font-weight: 250; }
  .inbox-empty p { margin: 0; font-size: .82rem; line-height: 1.5; }

  .backdrop { position: fixed; z-index: 10; inset: 0; display: grid; place-items: center; padding: 20px; background: rgb(24 37 31 / .44); backdrop-filter: blur(5px); animation: fade-in 180ms ease-out; }
  .modal { position: relative; width: min(610px, 100%); padding: 34px; color: #18251f; background: #fdfcf8; border: 1px solid #cbd3cb; box-shadow: 0 22px 70px rgb(20 41 29 / .25); animation: modal-in 240ms ease-out both; }
  .modal h2 { max-width: 470px; margin: 0 32px 10px 0; font-size: clamp(2rem, 5vw, 2.8rem); line-height: 1.02; }
  .modal-intro { max-width: 485px; margin-bottom: 25px; color: #617067; font-size: .91rem; line-height: 1.5; }
  .close-button { position: absolute; top: 19px; right: 21px; font-size: 1.7rem; line-height: 1; }
  .profile-fields { display: grid; grid-template-columns: 1.1fr .9fr; gap: 16px; }
  .full-field { grid-column: 1 / -1; }
  .modal-action { margin-top: 24px; }
  .modal-action span { margin-left: 8px; }

  :global(button:focus-visible), :global(a:focus-visible), :global(input:focus-visible), :global(textarea:focus-visible), :global(select:focus-visible) { outline: 3px solid #e3ae3d; outline-offset: 3px; }
  @keyframes reveal { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes modal-in { from { opacity: 0; transform: translateY(12px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; transition-duration: .01ms !important; } }
  @media (max-width: 800px) {
    main { padding: 0 20px 38px; }
    .masthead { grid-template-columns: 1fr auto; gap: 8px 20px; min-height: 80px; padding: 15px 0; }
    .masthead-copy { grid-column: 1 / -1; grid-row: 2; gap: 9px; font-size: .73rem; }
    .desk { grid-template-columns: 1fr; gap: 44px; padding-top: 34px; }
    .decision-panel { order: 1; }
    .inbox-panel { order: 2; padding-left: 0; border-top: 1px solid #d9ddd5; border-left: 0; padding-top: 34px; }
    .ranking-trigger { grid-template-columns: 36px minmax(0, 1fr) auto 18px; gap: 10px; }
    .top-pick .ranking-trigger { padding: 22px 16px; }
    .score-detail { padding: 0 16px 22px; }
  }
  @media (max-width: 520px) {
    .masthead-copy p:last-child { display: none; }
    h1 { font-size: 2.4rem; }
    .section-heading.decision-heading { align-items: flex-start; flex-direction: column; }
    .primary-button { width: 100%; }
    .ranked-list { margin-top: 28px; }
    .ranking-content strong, .top-pick .ranking-content strong { font-size: 1.18rem; }
    .top-pick .rank-number { font-size: 1.8rem; }
    .score-block b, .top-pick .score-block b { font-size: 1.55rem; }
    .idea-summary { display: none; }
    .score-readout { grid-template-columns: repeat(2, 1fr); }
    .detail-grid, .profile-fields { grid-template-columns: 1fr; }
    .modal { padding: 27px 21px; }
  }
</style>
