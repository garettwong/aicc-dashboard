const state = {
  data: null,
  view: 'today',
  filter: 'all',
  query: '',
  visibleLimit: 60,
  saved: new Set(JSON.parse(localStorage.getItem('aicc-saved') || '[]')),
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const viewMeta = {
  today: ['Today', 'Worth your attention', 'A short list. No newsletter noise.'],
  radar: ['Fresh radar', 'What Hermes just noticed', 'Raw signals for awareness. Verify before acting.'],
  saved: ['Saved', 'Your shortlist', 'Signals you marked for later.'],
  archive: ['Old archive', 'All original AICC records', 'Every preserved legacy record is searchable here.'],
  health: ['Hermes health', 'What is running', 'Healthy, failing, and paused jobs in one place.'],
};

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}

function relativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown freshness';
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 2) return 'Updated just now';
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `Updated ${hours}h ago`;
  return `Updated ${Math.round(hours / 24)}d ago`;
}

function categoryKey(item) {
  const text = `${item.category || ''} ${item.title || ''} ${item.summary || ''}`.toLowerCase();
  if (/3d|blender|visual|image|video|creative|design/.test(text)) return '3d';
  if (/teach|course|student|class|learning/.test(text)) return 'teaching';
  if (/business|client|marketing|sales|job|opportun/.test(text)) return 'business';
  return 'tools';
}

function allItems() {
  if (!state.data) return [];
  if (state.view === 'health') return state.data.health.jobs.map((job) => ({
    ...job,
    id: `job-${job.id}`,
    kind: 'health',
    title: job.name,
    summary: job.message || `${job.schedule || 'No schedule'} · ${job.state}`,
    category: job.state,
    date: job.lastRun || '',
  }));
  const groups = {
    today: state.data.today.items,
    radar: state.data.radar.items,
    archive: state.data.archive.items,
    saved: [...state.data.today.items, ...state.data.radar.items, ...state.data.archive.items].filter((item) => state.saved.has(item.id)),
  };
  return groups[state.view] || [];
}

function filteredItems() {
  const query = state.query.trim().toLowerCase();
  return allItems().filter((item) => {
    const matchesFilter = state.filter === 'all' || state.view === 'health' || categoryKey(item) === state.filter;
    const haystack = `${item.title || ''} ${item.summary || ''} ${item.category || ''} ${item.source || ''}`.toLowerCase();
    return matchesFilter && (!query || haystack.includes(query));
  });
}

function badgeClass(item) {
  if (item.kind !== 'health') return '';
  if (item.state === 'error') return 'error';
  if (item.state === 'paused') return 'paused';
  return 'ok';
}

function cardHtml(item) {
  const saved = state.saved.has(item.id);
  const sourceButton = item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">Source ↗</a>` : '';
  const action = item.kind === 'health' ? '' : `<button class="save-button ${saved ? 'saved' : ''}" type="button" data-save="${escapeHtml(item.id)}">${saved ? 'Saved' : 'Save'}</button>`;
  return `
    <article class="signal-card" data-id="${escapeHtml(item.id)}">
      <div class="card-top">
        <span class="badge ${badgeClass(item)}">${escapeHtml(item.category || item.kind || 'Signal')}</span>
        <time class="card-date">${escapeHtml(item.displayDate || item.date || '')}</time>
      </div>
      <h3>${escapeHtml(item.title || 'Untitled signal')}</h3>
      <p>${escapeHtml(item.summary || 'No summary available.')}</p>
      <div class="card-spacer"></div>
      <div class="card-actions">
        <button class="details-button" type="button" data-detail="${escapeHtml(item.id)}">Details</button>
        ${sourceButton}
        ${action}
      </div>
    </article>`;
}

function renderCards() {
  const items = filteredItems();
  const paged = state.view === 'archive' ? items.slice(0, state.visibleLimit) : items;
  $('#cardGrid').innerHTML = paged.map(cardHtml).join('');
  $('#emptyState').classList.toggle('hidden', items.length !== 0);
  const canLoadMore = state.view === 'archive' && paged.length < items.length;
  $('#loadMoreRow').classList.toggle('hidden', !canLoadMore);
  $('#archiveProgress').textContent = canLoadMore ? `Showing ${paged.length} of ${items.length}` : '';
  $$('.filter-button').forEach((button) => button.classList.toggle('active', button.dataset.filter === state.filter));
  bindCardActions();
}

function bindCardActions() {
  $$('[data-save]').forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.save;
    state.saved.has(id) ? state.saved.delete(id) : state.saved.add(id);
    localStorage.setItem('aicc-saved', JSON.stringify([...state.saved]));
    updateCounts();
    renderCards();
  }));
  $$('[data-detail]').forEach((button) => button.addEventListener('click', () => openDetail(button.dataset.detail)));
}

function findItem(id) {
  const normal = [...state.data.today.items, ...state.data.radar.items, ...state.data.archive.items].find((item) => item.id === id);
  if (normal) return normal;
  const job = state.data.health.jobs.find((item) => `job-${item.id}` === id);
  return job ? { ...job, id, kind: 'health', title: job.name, category: job.state, summary: job.message } : null;
}

function openDetail(id) {
  const item = findItem(id);
  if (!item) return;
  const detail = item.detail || item.why || item.summary || '';
  const action = item.action || item.nextAction || '';
  const healthExtra = item.kind === 'health' ? `
    <div class="detail-block"><span>Schedule</span>${escapeHtml(item.schedule || 'Not scheduled')}</div>
    <div class="detail-block"><span>Last result</span>${escapeHtml(item.lastStatus || item.state || 'Unknown')}</div>` : '';
  const archiveExtra = item.kind === 'archive' ? `
    ${item.teaching ? `<div class="detail-block"><span>Teaching angle</span>${escapeHtml(item.teaching)}</div>` : ''}
    ${item.consulting ? `<div class="detail-block"><span>Consulting angle</span>${escapeHtml(item.consulting)}</div>` : ''}
    ${item.terms ? `<div class="detail-block"><span>Terms explained</span>${escapeHtml(item.terms)}</div>` : ''}
    <div class="detail-block"><span>Archive status</span>${escapeHtml([item.verification, item.workflowStage, item.originalStatus].filter(Boolean).join(' · ') || 'Legacy record')}</div>` : '';
  $('#dialogContent').innerHTML = `
    <span class="eyebrow">${escapeHtml(item.category || item.state || item.kind || 'Signal')}</span>
    <h2>${escapeHtml(item.title || item.name)}</h2>
    <p>${escapeHtml(item.summary || item.message || '')}</p>
    ${detail && detail !== item.summary ? `<div class="detail-block"><span>Why it matters</span>${escapeHtml(detail)}</div>` : ''}
    ${action ? `<div class="detail-block"><span>Next move</span>${escapeHtml(action)}</div>` : ''}
    ${healthExtra}
    ${archiveExtra}
    ${item.url ? `<p><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">Open original source ↗</a></p>` : ''}`;
  $('#detailDialog').showModal();
}

function setView(view) {
  state.view = view;
  state.filter = 'all';
  state.query = '';
  state.visibleLimit = 60;
  $('#searchInput').value = '';
  const [eyebrow, title, description] = viewMeta[view];
  $('#viewEyebrow').textContent = eyebrow;
  $('#viewTitle').textContent = title;
  $('#viewDescription').textContent = description;
  $('#filterRow').classList.toggle('hidden', view === 'health');
  $$('.nav-button').forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  $$('[data-filter]').forEach((button) => button.classList.toggle('active', button.dataset.filter === 'all'));
  renderCards();
  if (window.innerWidth < 980) $('#viewTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateCounts() {
  const data = state.data;
  const healthy = data.health.jobs.filter((job) => job.enabled && job.state === 'ok').length;
  const errors = data.health.jobs.filter((job) => job.enabled && job.state === 'error').length;
  $('#metricToday').textContent = data.today.items.length;
  $('#metricRadar').textContent = data.radar.items.length;
  $('#metricHealthy').textContent = healthy;
  $('#metricErrors').textContent = errors;
  $('#countToday').textContent = data.today.items.length;
  $('#countRadar').textContent = data.radar.items.length;
  $('#countSaved').textContent = state.saved.size;
  $('#countArchive').textContent = data.archive.items.length;
  $('#countHealth').textContent = data.health.jobs.length;
}

function renderHeader() {
  const data = state.data;
  $('#freshness').textContent = relativeTime(data.meta.generatedAt);
  $('#heroTitle').textContent = data.today.headline || (data.today.items.length ? `${data.today.items.length} things worth knowing` : 'Nothing worth interrupting you for');
  $('#heroMessage').textContent = data.today.message || 'Hermes filtered the rest.';
  $('#sourceSummary').textContent = `${data.meta.sourceCount} sources · ${data.archive.items.length} archived references`;
}

async function loadDashboard() {
  const response = await fetch(`data/dashboard.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Dashboard data returned ${response.status}`);
  state.data = await response.json();
  renderHeader();
  updateCounts();
  renderCards();
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('aicc-theme', theme);
}

$$('[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
$$('[data-filter]').forEach((button) => button.addEventListener('click', () => { state.filter = button.dataset.filter; state.visibleLimit = 60; renderCards(); }));
$('#searchInput').addEventListener('input', (event) => { state.query = event.target.value; state.visibleLimit = 60; renderCards(); });
$('#loadMoreButton').addEventListener('click', () => { state.visibleLimit += 60; renderCards(); });
$('#dialogClose').addEventListener('click', () => $('#detailDialog').close());
$('#detailDialog').addEventListener('click', (event) => { if (event.target === $('#detailDialog')) $('#detailDialog').close(); });
$('#themeButton').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));
applyTheme(localStorage.getItem('aicc-theme') || 'dark');

loadDashboard().catch((error) => {
  $('#heroTitle').textContent = 'Dashboard data is unavailable';
  $('#heroMessage').textContent = `${error.message}. Run scripts/refresh_dashboard.py, then reload.`;
  $('#cardGrid').innerHTML = '';
  $('#emptyState').classList.remove('hidden');
});
