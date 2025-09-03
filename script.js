const API_KEY = 'fw_3ZSw7T7yeAxeDAKaVaosL8Fr'; // Replace with your Fireworks API Key
const url = 'https://api.fireworks.ai/inference/v1/chat/completions';

const chatBox = document.getElementById('chat-box');
const inputBox = document.getElementById('input-box');
const sendButton = document.getElementById('send-button');

const form = document.getElementById('prefs');
const results = document.getElementById('results');

document.getElementById('interests').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  chip.classList.toggle('active');
});

document.getElementById('clear-btn').addEventListener('click', () => {
  form.reset();
  document.querySelectorAll('.chip.active').forEach(c => c.classList.remove('active'));
  chatBox.innerHTML = '';
  results.innerHTML = '';
  inputBox.value = '';
  addMsg('ai', 'Cleared. Ready for a fresh search!');
});

function addMsg(who, text) {
  const msg = document.createElement('div');
  msg.className = `msg ${who}`;
  msg.innerHTML = `\n        <div class="who">${who === 'user' ? 'U' : 'AI'}</div>\n        <div class="bubble">${escapeHtml(text)}</div>\n      `;
  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function escapeHtml(s) {
  return s.replace(/[&<>\"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
}

function getPrefs() {
  const get = (id) => document.getElementById(id).value.trim();
  const origin = get('origin');
  const budget = parseFloat(get('budget')) || 0;
  const start = get('start');
  const end = get('end');
  const nights = parseInt(get('nights') || '0', 10) || null;
  const travelers = document.getElementById('travelers').value;
  const pace = document.getElementById('pace').value;
  const climate = document.getElementById('climate').value;
  const language = get('language');
  const prefer = get('prefer');
  const avoid = get('avoid');
  const interests = Array.from(document.querySelectorAll('#interests .chip.active')).map(c => c.dataset.val);
  const extras = inputBox.value.trim();

  return { origin, budget_eur: budget, start, end, nights, travelers, pace, climate, language, prefer_regions: prefer, avoid_regions: avoid, interests, extras };
}

function buildSystemPrompt() {
  return `You are TravelMatch AI. Your job: pick ONE best travel destination worldwide given the user's inputs.\n\n` +
  `CRITERIA (in order): 1) Stay within budget (EUR). 2) Seasonality & weather for the dates. 3) Distance/flight time and route practicality from origin. 4) Interests fit. 5) Safety & visa ease for an EU/German passport by default (unless stated otherwise). 6) Crowd levels & value for money.\n\n` +
  `OUTPUT JSON EXACTLY in this schema (no markdown, no extra text):\n` +
  `{\n` +
  `  "best_pick": {\n` +
  `    "name": "", "country": "", "region": "",\n` +
  `    "why": "",\n` +
  `    "when_to_go": {"window": "", "weather": ""},\n` +
  `    "cost_breakdown": {\n` +
  `      "flights": 0, "lodging_per_night": 0, "nights": 0, "activities": 0, "local_transport": 0, "food": 0, "buffer": 0, "total_estimated": 0\n` +
  `    },\n` +
  `    "fit_scores": {"budget": 0, "weather": 0, "distance": 0, "interests": 0, "safety": 0, "visa": 0, "crowding": 0},\n` +
  `    "cautions": [],\n` +
  `    "suggested_itinerary": ["Day 1: ...", "Day 2: ..."],\n` +
  `    "alt_airports": [],\n` +
  `    "notes": []\n` +
  `  },\n` +
  `  "runners_up": [\n` +
  `    {"name": "", "country": "", "why": "", "est_total": 0},\n` +
  `    {"name": "", "country": "", "why": "", "est_total": 0}\n` +
  `  ],\n` +
  `  "assumptions": []\n` +
  `}\n\n` +
  `RULES: Use EUR for all amounts. Keep integers (no decimals). Keep total_estimated <= budget if feasible. Choose realistic values for flights from the origin city given the timing. If the budget is too low, still return a best_pick and explain trade-offs in "notes". Always fill every field.`;
}

function buildUserContent(prefs) {
  return `USER INPUTS\n` +
  `Origin: ${prefs.origin}\n` +
  `Budget (EUR): ${prefs.budget_eur}\n` +
  `Dates: ${prefs.start || 'unspecified'} to ${prefs.end || 'unspecified'} (Nights: ${prefs.nights || 'auto'})\n` +
  `Travelers: ${prefs.travelers}; Pace: ${prefs.pace}; Climate: ${prefs.climate}\n` +
  `Interests: ${prefs.interests.join(', ') || 'unspecified'}\n` +
  `Prefer regions: ${prefs.prefer_regions || 'n/a'}; Avoid regions: ${prefs.avoid_regions || 'n/a'}\n` +
  `Languages comfortable: ${prefs.language || 'n/a'}\n` +
  `Other conditions: ${prefs.extras || 'n/a'}`;
}

async function callFireworks(systemPrompt, userContent) {
  const payload = {
    model: 'accounts/fireworks/models/llama-v3p1-70b-instruct', // You can change to any compatible model in your account
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    max_tokens: 1400,
    temperature: 0.6,
    top_p: 0.9
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`API error ${res.status}: ${txt}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';
  return content;
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      const slice = text.slice(first, last + 1);
      try { return JSON.parse(slice); } catch (_) {}
    }
    return null;
  }
}

function euro(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '—';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

function pct(n) {
  n = Math.max(0, Math.min(100, Math.round(n)));
  return n + '%';
}

function renderBestPick(bp, budget) {
  const wrap = document.createElement('div');
  wrap.className = 'result-card';

  const overall = computeOverallScore(bp.fit_scores || {});
  const util = budget ? Math.round(((bp.cost_breakdown?.total_estimated || 0) / budget) * 100) : null;
  const utilColor = util == null ? '' : util <= 100 ? 'success' : 'error';

  wrap.innerHTML = `
    <div class="result-header">
      <div>
        <div class="result-title">Best pick: ${escapeHtml(bp.name || '—')}, ${escapeHtml(bp.country || '')}</div>
        <div class="tiny muted">${escapeHtml(bp.region || '')}</div>
      </div>
      <div class="badge">Overall fit: ${pct(overall)}</div>
    </div>

    <div class="two-col" style="margin-top: 12px;">
      <div>
        <p>${escapeHtml(bp.why || '')}</p>
        <p class="tiny muted">When to go: <strong>${escapeHtml(bp.when_to_go?.window || '')}</strong>  ${escapeHtml(bp.when_to_go?.weather || '')}</p>

        <div style="margin: 14px 0;">
          <div class="tiny muted" style="margin-bottom: 6px;">Budget utilization${util == null ? '' : `: <strong class="${utilColor}">${util}%</strong>`}</div>
          <div class="scorebar" title="Budget utilization">
            <div style="width:${util == null ? 0 : Math.min(util, 100)}%"></div>
          </div>
        </div>

        <h4 style="margin: 14px 0 6px;">Itinerary (sample)</h4>
        <ul style="margin: 0 0 8px 18px; padding: 0;">
          ${Array.isArray(bp.suggested_itinerary) ? bp.suggested_itinerary.map(day => `<li>${escapeHtml(day)}</li>`).join('') : ''}
        </ul>
        ${Array.isArray(bp.cautions) && bp.cautions.length ? `<p class="tiny"><span class="pill">Heads-up</span> ${escapeHtml(bp.cautions.join(' • '))}</p>` : ''}
        ${Array.isArray(bp.notes) && bp.notes.length ? `<p class="tiny muted">Notes: ${escapeHtml(bp.notes.join(' • '))}</p>` : ''}
      </div>

      <div>
        <h4 style="margin: 0 0 6px;">Costs (estimate)</h4>
        ${renderCostTable(bp.cost_breakdown)}
        ${bp.alt_airports && bp.alt_airports.length ? `<p class="tiny muted">Alt airports: ${escapeHtml(bp.alt_airports.join(', '))}</p>` : ''}

        <h4 style="margin: 14px 0 6px;">Fit breakdown</h4>
        ${renderScores(bp.fit_scores || {})}
      </div>
    </div>
  `;
  return wrap;
}

function renderCostTable(cb = {}) {
  const rows = [
    ['Flights', cb.flights],
    ['Lodging/night', cb.lodging_per_night],
    ['Nights', cb.nights],
    ['Activities', cb.activities],
    ['Local transport', cb.local_transport],
    ['Food', cb.food],
    ['Buffer', cb.buffer],
  ];
  const total = cb.total_estimated || (cb.flights || 0) + (cb.lodging_per_night || 0) * (cb.nights || 0) + (cb.activities || 0) + (cb.local_transport || 0) + (cb.food || 0) + (cb.buffer || 0);
  return `
    <table>
      <thead><tr><th>Item</th><th>Estimate</th></tr></thead>
      <tbody>
        ${rows.map(([k,v]) => `<tr><td>${escapeHtml(k)}</td><td>${euro(v)}</td></tr>`).join('')}
      </tbody>
      <tfoot>
        <tr><th>Total</th><th>${euro(total)}</th></tr>
      </tfoot>
    </table>
  `;
}

function renderScores(scores) {
  const keys = [
    ['budget', 'Budget'],
    ['weather', 'Weather'],
    ['distance', 'Distance'],
    ['interests', 'Interests'],
    ['safety', 'Safety'],
    ['visa', 'Visa'],
    ['crowding', 'Crowding']
  ];
  return keys.map(([k,label]) => {
    const val = Math.max(0, Math.min(100, Number(scores[k] || 0)));
    return `
      <div class="tiny muted" style="margin: 6px 0 4px;">${label} • ${val}%</div>
      <div class="scorebar" aria-label="${label} score"><div style="width:${val}%"></div></div>
    `;
  }).join('');
}

function computeOverallScore(scores) {
  const w = { budget: .25, weather: .20, distance: .15, interests: .20, safety: .10, visa: .05, crowding: .05 };
  let sum = 0, tot = 0;
  for (const k in w) { const s = Math.max(0, Math.min(100, Number(scores[k] || 0))); sum += s * w[k]; tot += w[k]; }
  return Math.round(sum / tot);
}

function renderRunners(runners = []) {
  if (!runners.length) return '';
  return `
    <div class="result-card">
      <div class="result-header" style="margin-bottom: 8px;">
        <div class="result-title">Strong Alternatives</div>
        <span class="badge">Top ${runners.length}</span>
      </div>
      <table>
        <thead><tr><th>Destination</th><th>Why</th><th>Est. Total</th></tr></thead>
        <tbody>
          ${runners.map(r => `<tr>
            <td><strong>${escapeHtml(r.name || '—')}</strong>${r.country ? `, ${escapeHtml(r.country)}` : ''}</td>
            <td>${escapeHtml(r.why || '')}</td>
            <td>${euro(r.est_total)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function downloadJSON(filename, json) {
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

async function handleSend() {
  results.innerHTML = '';
  const prefs = getPrefs();

  if (!prefs.origin || !prefs.budget_eur) {
    addMsg('ai', '<span class="error">Please provide origin and total budget (€).</span>');
    return;
  }

  const userSummary = `Find the best destination for ${prefs.travelers} from ${prefs.origin} with a budget of €${prefs.budget_eur}.`;
  addMsg('user', userSummary + (prefs.extras ? ` Extras: ${prefs.extras}` : ''));
  addMsg('ai', 'Analyzing your inputs, checking seasonality and value…');

  try {
    const system = buildSystemPrompt();
    const user = buildUserContent(prefs);
    const raw = await callFireworks(system, user);

    const parsed = tryParseJson(raw);
    if (!parsed) {
      addMsg('ai', `<span class="error">I couldn't parse the response as JSON.</span> Here's the raw reply for debugging:<br><pre class="tiny">${escapeHtml(raw)}</pre>`);
      return;
    }

    const bp = parsed.best_pick || {};
    const box = renderBestPick(bp, prefs.budget_eur);
    results.appendChild(box);

    const runnersHtml = renderRunners(parsed.runners_up || []);
    if (runnersHtml) {
      const el = document.createElement('div');
      el.innerHTML = runnersHtml;
      results.appendChild(el.firstElementChild);
    }

    const meta = document.createElement('div');
    meta.className = 'result-card';
    meta.innerHTML = `
      <div class="result-header" style="margin-bottom: 8px;">
        <div class="result-title">Analysis & Explanation</div>
      </div>
      <p>Based on your budget, timing, and interests, the model scored destinations across budget fit, expected weather, travel distance, interest alignment, safety/visa ease, and crowding. The <em>Overall fit</em> gauge is a weighted blend of those factors. The cost table shows a transparent estimate and how it uses your budget.</p>
      ${(parsed.assumptions && parsed.assumptions.length) ? `<p class="tiny muted">Assumptions: ${escapeHtml(parsed.assumptions.join(' • '))}</p>` : ''}
      <div style="display:flex; gap:8px; margin-top: 10px;">
        <button class="secondary" type="button" id="dl-json">Download JSON</button>
        <button class="secondary" type="button" id="retry">Try another pick</button>
      </div>
    `;
    results.prepend(meta);

    document.getElementById('dl-json').onclick = () => downloadJSON('travelmatch_plan.json', parsed);
    document.getElementById('retry').onclick = () => handleSend();

    addMsg('ai', 'Done! Analysis appears under your questions, with the pick and costs below.');
  } catch (err) {
    console.error(err);
    addMsg('ai', `<span class="error">${escapeHtml(err.message)}</span>`);
  }
}

sendButton.addEventListener('click', handleSend);

inputBox.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    handleSend();
  }
});

addMsg('ai', 'Tell me your origin, budget, and dates  I\'ll find a destination that maximizes weather, value, and your interests.');
