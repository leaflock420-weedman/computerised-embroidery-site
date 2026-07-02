const KEY_STORAGE = 'ce-admin-key';
let adminKey = localStorage.getItem(KEY_STORAGE) || '';
let jobs = [];
let selectedId = null;

const headers = () => ({ 'Content-Type': 'application/json', 'X-Admin-Key': adminKey });

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { ...headers(), ...opts.headers } });
  if (res.status === 401) throw new Error('auth');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

function showApp() {
  document.getElementById('adminLogin').hidden = true;
  document.getElementById('adminMain').hidden = false;
}

function showLogin() {
  document.getElementById('adminLogin').hidden = false;
  document.getElementById('adminMain').hidden = true;
}

async function login(key) {
  adminKey = key;
  localStorage.setItem(KEY_STORAGE, key);
  try {
    await api('/api/production/stats');
    showApp();
    await refresh();
  } catch (e) {
    if (e.message === 'auth') {
      localStorage.removeItem(KEY_STORAGE);
      alert('Invalid production key.');
    }
    showLogin();
  }
}

async function refresh() {
  const [stats, jobList] = await Promise.all([
    api('/api/production/stats'),
    api('/api/production/jobs'),
  ]);
  jobs = jobList;
  renderStats(stats);
  renderJobList();
  if (selectedId) renderDetail(jobs.find(j => j.id === selectedId));
}

function renderStats(s) {
  document.getElementById('statsRow').innerHTML = [
    ['Total jobs', s.total],
    ['Ready', s.ready],
    ['Approved', s.approved],
    ['Processing', s.processing],
    ['Failed', s.failed],
  ].map(([label, val]) =>
    `<div class="stat-card"><strong>${val}</strong><span>${label}</span></div>`
  ).join('');
}

function filteredJobs() {
  const q = document.getElementById('jobSearch').value.toLowerCase();
  const status = document.getElementById('statusFilter').value;
  return jobs.filter(j => {
    if (status && j.status !== status) return false;
    if (q && !j.id.includes(q) && !(j.originalName || '').toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderJobList() {
  const list = filteredJobs();
  const el = document.getElementById('jobList');
  if (!list.length) {
    el.innerHTML = '<p style="padding:1rem;color:var(--text-muted);font-size:0.85rem">No digitize jobs yet. Upload artwork in the Design Studio.</p>';
    return;
  }
  el.innerHTML = list.map(j => `
    <div class="job-item${j.id === selectedId ? ' active' : ''}" data-id="${j.id}">
      <div class="job-item__name">${j.originalName || j.id}</div>
      <div class="job-item__meta">${new Date(j.createdAt).toLocaleString('en-AU')}</div>
      <span class="status-pill status-pill--${j.status}">${j.status}</span>
      ${j.stitchCount ? `<div class="job-item__meta">${j.stitchCount.toLocaleString()} stitches · ${j.colorCount} colours</div>` : ''}
    </div>
  `).join('');
  el.querySelectorAll('.job-item').forEach(item => {
    item.addEventListener('click', () => {
      selectedId = item.dataset.id;
      renderJobList();
      renderDetail(jobs.find(j => j.id === selectedId));
    });
  });
}

function renderDetail(job) {
  const el = document.getElementById('jobDetail');
  if (!job) {
    el.innerHTML = '<p class="job-detail__empty">Select a job to review.</p>';
    return;
  }

  const files = job.files || job.production?.files || {};
  const colors = job.production?.colors || [];
  const preview = files.preview || job.production?.files?.preview;

  el.innerHTML = `
    <h2>${job.originalName || job.id}</h2>
    <p class="job-item__meta">Job ${job.id} · <span class="status-pill status-pill--${job.status}">${job.status}</span></p>

    <div class="detail-grid">
      <div class="detail-preview">
        <h3>Stitch preview</h3>
        ${preview ? `<img src="${preview}" alt="Stitch preview">` : '<p>No preview yet</p>'}
      </div>
      <div>
        <h3>Production info</h3>
        <ul class="artwork-meta">
          <li>Stitches: <strong>${job.stitchCount?.toLocaleString() || '—'}</strong></li>
          <li>Thread colours: <strong>${job.colorCount || '—'}</strong></li>
          <li>Size: <strong>${job.production?.widthMm || '—'} × ${job.production?.heightMm || '—'} mm</strong></li>
        </ul>
        <div class="color-chips">${colors.map(c =>
          `<span class="color-chip" style="background:${c.hex}" title="Thread ${c.index}"></span>`
        ).join('')}</div>
        <p><a href="${job.originalUrl}" target="_blank">View original artwork</a></p>
      </div>
    </div>

    <h3>Machine files</h3>
    <div class="detail-files">
      ${files.dst ? `<a href="${files.dst}" download>Download DST</a>` : ''}
      ${files.pes ? `<a href="${files.pes}" download>Download PES</a>` : ''}
      ${files.jef ? `<a href="${files.jef}" download>Download JEF</a>` : ''}
      ${preview ? `<a href="${preview}" download>Stitch preview PNG</a>` : ''}
    </div>

    <div class="detail-actions">
      ${job.status === 'ready' ? `<button type="button" class="btn btn--primary" id="approveJob">✓ Approve for production</button>` : ''}
      <button type="button" class="btn btn--outline" id="redigitizeJob">Re-digitize</button>
    </div>
    ${job.error ? `<p class="warn" style="color:#b45309;margin-top:1rem">${job.error}</p>` : ''}
    ${job.notes ? `<p class="job-item__meta">Notes: ${job.notes}</p>` : ''}
  `;

  document.getElementById('approveJob')?.addEventListener('click', async () => {
    const notes = prompt('Optional notes for production:') || '';
    await api(`/api/production/jobs/${job.id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ notes, by: 'worker' }),
    });
    await refresh();
  });

  document.getElementById('redigitizeJob')?.addEventListener('click', async () => {
    if (!confirm('Re-run auto-digitize on this artwork?')) return;
    await api(`/api/production/jobs/${job.id}/redigitize`, { method: 'POST', body: '{}' });
    await refresh();
  });
}

document.getElementById('adminLoginBtn').addEventListener('click', () => {
  const key = document.getElementById('adminKeyInput').value.trim();
  if (key) login(key);
});

document.getElementById('adminKeyInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('adminLoginBtn').click();
});

let orders = [];

async function loadOrders() {
  orders = await api('/api/orders');
  renderOrders();
}

function renderOrders() {
  const el = document.getElementById('ordersList');
  if (!orders.length) {
    el.innerHTML = '<p class="job-detail__empty">No customer orders yet. Orders appear here when checkout runs on the local server.</p>';
    return;
  }
  el.innerHTML = orders.map(o => {
    const items = (o.cart || []).map((item, i) => {
      const art = item.artwork;
      const files = [
        art?.originalUrl && `<a href="${art.originalUrl}" target="_blank">Original</a>`,
        art?.previewUrl && `<a href="${art.previewUrl}" target="_blank">Preview</a>`,
        item.productionFiles?.dst && `<a href="${item.productionFiles.dst}" download>DST</a>`,
        item.productionFiles?.pes && `<a href="${item.productionFiles.pes}" download>PES</a>`,
        item.productionFiles?.jef && `<a href="${item.productionFiles.jef}" download>JEF</a>`,
      ].filter(Boolean).join('');
      return `<li><strong>${item.name}</strong> — ${item.colour} × ${item.qty} (${item.embroidery})
        ${art ? `<div class="order-card__links">${files}</div>` : ''}</li>`;
    }).join('');
    return `<article class="order-card">
      <h3>${o.customer?.name || 'Customer'} — ${o.id.slice(0, 8)}</h3>
      <p class="order-card__meta">${o.customer?.email || ''} · ${o.customer?.phone || ''} · ${new Date(o.receivedAt).toLocaleString()}</p>
      <ul class="order-card__items">${items}</ul>
    </article>`;
  }).join('');
}

document.querySelectorAll('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const jobs = tab.dataset.tab === 'jobs';
    document.getElementById('jobsPanel').hidden = !jobs;
    document.getElementById('ordersPanel').hidden = jobs;
    if (!jobs) loadOrders().catch(() => alert('Could not load orders'));
  });
});

document.getElementById('refreshJobs').addEventListener('click', refresh);
document.getElementById('refreshOrders').addEventListener('click', () => loadOrders().catch(() => {}));
document.getElementById('jobSearch').addEventListener('input', renderJobList);
document.getElementById('statusFilter').addEventListener('change', renderJobList);

if (adminKey) login(adminKey);
else showLogin();

setInterval(() => {
  if (!document.getElementById('adminMain').hidden) {
    refresh().catch(() => {});
    if (!document.getElementById('ordersPanel').hidden) loadOrders().catch(() => {});
  }
}, 15000);