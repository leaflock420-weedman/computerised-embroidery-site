const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const archiver = require('archiver');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 8765;
const ROOT = __dirname;
const UPLOADS = path.join(ROOT, 'uploads');
const ORDERS = path.join(ROOT, 'data', 'orders');
const PRODUCTION = path.join(UPLOADS, 'production');
const JOBS = path.join(ROOT, 'data', 'digitize-jobs');
const ADMIN_KEY = process.env.ADMIN_KEY || 'ce-production-2026';

[UPLOADS, path.join(UPLOADS, 'original'), path.join(UPLOADS, 'preview'),
 path.join(UPLOADS, 'digitize'), PRODUCTION, ORDERS, JOBS].forEach(d => {
  fs.mkdirSync(d, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(UPLOADS, 'original')),
  filename: (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

app.use(express.json({ limit: '50mb' }));

const PAGE_SLUGS = ['designer', 'shop', 'checkout', 'admin', 'product', 'index'];

app.get(new RegExp(`^/(${PAGE_SLUGS.join('|')})/?$`, 'i'), (req, res) => {
  const page = req.params[0].toLowerCase();
  const file = page === 'index' ? 'index.html' : `${page}.html`;
  const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  res.redirect(301, `/${file}${qs}`);
});

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const match = req.path.match(/^\/(.+\.html)$/i);
  if (!match) return next();
  const rel = match[1].toLowerCase();
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return next();
  if (req.path !== `/${rel}`) {
    const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    return res.redirect(301, `/${rel}${qs}`);
  }
  return res.sendFile(file);
});

app.use(express.static(ROOT));
app.use('/uploads', express.static(UPLOADS));

const PROXY_HOSTS = new Set([
  'cdn11.bigcommerce.com',
  'www.jbswear.com.au',
  'www.winningspirit.com.au',
  'kcembroidery.co.nz',
  'www.dncworkwear.com.au',
  'www.ascolour.com.au',
  'cdn.shopify.com',
]);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'computerised-embroidery' });
});

app.get('/api/proxy-image', async (req, res) => {
  const raw = req.query.url;
  if (!raw) return res.status(400).send('url required');
  let target;
  try {
    target = new URL(raw);
  } catch {
    return res.status(400).send('invalid url');
  }
  if (!PROXY_HOSTS.has(target.hostname)) {
    return res.status(403).send('host not allowed');
  }
  try {
    const upstream = await fetch(target.toString(), {
      headers: { 'User-Agent': 'CE-Image-Proxy/1.0' },
    });
    if (!upstream.ok) return res.status(upstream.status).end();
    const ct = upstream.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (e) {
    res.status(502).send('proxy failed');
  }
});

function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function saveJob(job) {
  fs.writeFileSync(path.join(JOBS, `${job.id}.json`), JSON.stringify(job, null, 2));
  return job;
}

function loadJob(id) {
  const f = path.join(JOBS, `${id}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}

function listJobs() {
  return fs.readdirSync(JOBS).filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(JOBS, f), 'utf8')))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function publicJobStatus(job) {
  const base = {
    id: job.id,
    status: job.status,
    stitchCount: job.stitchCount,
    colorCount: job.colorCount,
  };
  if (job.status === 'processing') {
    base.message = 'Our team is preparing your embroidery files…';
  } else if (job.status === 'ready' || job.status === 'approved') {
    base.message = `✓ Design received (${(job.stitchCount || 0).toLocaleString()} stitches, ${job.colorCount || '?'} colours). Our team will handle production.`;
  } else if (job.status === 'failed') {
    base.message = 'Design saved — our team will prepare production files manually.';
  }
  return base;
}

function publicUploadMeta(meta) {
  const {
    dstUrl, pesUrl, jefUrl, stitchPreviewUrl,
    ...safe
  } = meta;
  if (safe.digitizeNote && /DST|PES|JEF|Production Hub/i.test(safe.digitizeNote)) {
    safe.digitizeNote = safe.stitchCount
      ? `Design received (${safe.stitchCount} stitches). Our team will handle production.`
      : 'Sent to our team for embroidery production.';
  }
  return safe;
}

function runAutoDigitize(inputPath, jobId) {
  return new Promise((resolve, reject) => {
    const script = path.join(ROOT, 'scripts', 'auto-digitize.py');
    const proc = spawn('python', [script, inputPath, PRODUCTION, jobId], { cwd: ROOT });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });
    proc.on('close', code => {
      try {
        const result = JSON.parse(stdout.trim() || '{}');
        if (code === 0 && result.ok) resolve(result);
        else reject(new Error(result.error || stderr || 'Digitize failed'));
      } catch (e) {
        reject(new Error(stderr || stdout || e.message));
      }
    });
  });
}

async function queueProductionDigitize({ artworkId, originalPath, originalName, meta = {} }) {
  const jobId = artworkId || uuidv4();
  const job = {
    id: jobId,
    status: 'processing',
    originalName,
    originalUrl: `/uploads/original/${path.basename(originalPath)}`,
    createdAt: new Date().toISOString(),
    meta,
    production: null,
    error: null,
  };
  saveJob(job);

  try {
    const result = await runAutoDigitize(originalPath, jobId);
    job.status = 'ready';
    job.production = result;
    job.stitchCount = result.stitchCount;
    job.colorCount = result.colorCount;
    job.files = result.files;
    job.completedAt = new Date().toISOString();
    saveJob(job);
    return job;
  } catch (err) {
    job.status = 'failed';
    job.error = err.message;
    job.completedAt = new Date().toISOString();
    saveJob(job);
    return job;
  }
}

async function processArtwork(filePath, originalName, clientMeta = {}) {
  const id = uuidv4();
  const meta = { id, originalName, createdAt: new Date().toISOString() };

  try {
    const image = sharp(filePath);
    const info = await image.metadata();
    meta.width = info.width;
    meta.height = info.height;
    meta.format = info.format;
    meta.dpi = info.density || Math.round((info.width || 0) / (100 / 25.4));

    const previewPath = path.join(UPLOADS, 'preview', `${id}.png`);
    const digitizePath = path.join(UPLOADS, 'digitize', `${id}.png`);

    await image.clone().resize(800, 800, { fit: 'inside', withoutEnlargement: true }).png().toFile(previewPath);
    await image.clone().resize(400, 400, { fit: 'inside' }).png({ colours: 8, dither: 0 }).toFile(digitizePath);

    meta.previewUrl = `/uploads/preview/${id}.png`;
    meta.digitizePreviewUrl = `/uploads/digitize/${id}.png`;
    meta.originalUrl = `/uploads/original/${path.basename(filePath)}`;

    fs.writeFileSync(path.join(UPLOADS, 'digitize', `${id}.json`), JSON.stringify(meta, null, 2));

    // Auto production digitize (DST/PES/JEF) — runs in background
    queueProductionDigitize({
      artworkId: id,
      originalPath: filePath,
      originalName,
      meta: clientMeta,
    }).then(job => {
      meta.productionJobId = job.id;
      meta.productionStatus = job.status;
      if (job.production) {
        meta.dstUrl = job.files?.dst;
        meta.pesUrl = job.files?.pes;
        meta.jefUrl = job.files?.jef;
        meta.stitchPreviewUrl = job.files?.preview;
        meta.stitchCount = job.stitchCount;
        meta.colorCount = job.colorCount;
        meta.digitizeNote = `Design received (${job.stitchCount} stitches). Our team will handle production.`;
      } else if (job.error) {
        meta.digitizeNote = 'Design saved — our team will prepare production files.';
      }
      fs.writeFileSync(path.join(UPLOADS, 'digitize', `${id}.json`), JSON.stringify(meta, null, 2));
    });

    meta.digitizeNote = 'Sent to our team for embroidery production.';
    return publicUploadMeta(meta);
  } catch (err) {
    meta.error = err.message;
    meta.digitizeNote = 'Could not auto-process — original saved for manual digitizing.';
    meta.originalUrl = `/uploads/original/${path.basename(filePath)}`;
    fs.writeFileSync(path.join(UPLOADS, 'digitize', `${id}.json`), JSON.stringify(meta, null, 2));
    return meta;
  }
}

// ─── Public API ───────────────────────────────────────────────

app.post('/api/upload-artwork', upload.single('artwork'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No artwork file' });
  try {
    const clientMeta = req.body.meta ? JSON.parse(req.body.meta) : {};
    const result = await processArtwork(req.file.path, req.file.originalname, clientMeta);
    res.json({ ...publicUploadMeta(result), clientMeta });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/digitize-status/:id', (req, res) => {
  const job = loadJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(publicJobStatus(job));
});

app.post('/api/export-design', (req, res) => {
  const { spec, views, artworkFileName } = req.body || {};
  if (!spec || !views?.length) return res.status(400).json({ error: 'Missing export data' });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="embroidery-${spec.product?.sku || 'design'}.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', err => res.status(500).end(err.message));
  archive.pipe(res);

  archive.append(JSON.stringify(spec, null, 2), { name: 'embroidery-spec.json' });
  archive.append(
    'Computerised Embroidery — design preview package.\n' +
    'Machine embroidery files are prepared by our team after you place your order.\n',
    { name: 'README.txt' },
  );
  views.forEach(v => {
    if (v.artworkPng) archive.append(Buffer.from(v.artworkPng, 'base64'), { name: `artwork-${v.view}-300dpi.png` });
    if (v.mockupPng) archive.append(Buffer.from(v.mockupPng, 'base64'), { name: `placement-${v.view}.png` });
  });
  if (artworkFileName) archive.append(`Original: ${artworkFileName}\n`, { name: 'original-filename.txt' });
  archive.finalize();
});

app.post('/api/submit-order', async (req, res) => {
  const { cart, customer, emailBody } = req.body || {};
  const order = {
    id: uuidv4(),
    cart: Array.isArray(cart) ? cart : [],
    customer: customer || {},
    emailBody: emailBody || '',
    receivedAt: new Date().toISOString(),
    status: 'pending',
  };

  order.cart = order.cart.map(item => {
    if (!item.artwork?.id) return item;
    const job = loadJob(item.artwork.id);
    return {
      ...item,
      productionJobId: item.artwork.id,
      productionStatus: job?.status || 'pending_upload',
      stitchCount: job?.stitchCount,
      productionFiles: job?.files || null,
    };
  });

  fs.writeFileSync(path.join(ORDERS, `${order.id}.json`), JSON.stringify(order, null, 2));
  res.json({ ok: true, orderId: order.id, hub: '/admin.html' });
});

app.get('/api/orders', requireAdmin, (_req, res) => {
  const files = fs.readdirSync(ORDERS).filter(f => f.endsWith('.json'));
  res.json(files.map(f => JSON.parse(fs.readFileSync(path.join(ORDERS, f), 'utf8'))));
});

// ─── Production Hub (worker admin) ──────────────────────────

app.get('/api/production/jobs', requireAdmin, (_req, res) => {
  res.json(listJobs());
});

app.get('/api/production/jobs/:id', requireAdmin, (req, res) => {
  const job = loadJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  res.json(job);
});

app.post('/api/production/jobs/:id/approve', requireAdmin, (req, res) => {
  const job = loadJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  job.status = 'approved';
  job.approvedAt = new Date().toISOString();
  job.approvedBy = req.body?.by || 'worker';
  job.notes = req.body?.notes || '';
  saveJob(job);
  res.json(job);
});

app.post('/api/production/jobs/:id/redigitize', requireAdmin, async (req, res) => {
  const job = loadJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  const originalPath = path.join(UPLOADS, 'original', path.basename(job.originalUrl));
  if (!fs.existsSync(originalPath)) return res.status(400).json({ error: 'Original file missing' });
  job.status = 'processing';
  saveJob(job);
  const updated = await queueProductionDigitize({
    artworkId: job.id,
    originalPath,
    originalName: job.originalName,
    meta: job.meta,
  });
  res.json(updated);
});

app.get('/api/production/stats', requireAdmin, (_req, res) => {
  const jobs = listJobs();
  res.json({
    total: jobs.length,
    ready: jobs.filter(j => j.status === 'ready').length,
    approved: jobs.filter(j => j.status === 'approved').length,
    processing: jobs.filter(j => j.status === 'processing').length,
    failed: jobs.filter(j => j.status === 'failed').length,
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Computerised Embroidery site → http://localhost:${PORT}`);
  console.log(`Designer        → http://localhost:${PORT}/designer.html`);
  console.log(`Production Hub  → http://localhost:${PORT}/admin.html`);
  console.log(`Admin key       → ${ADMIN_KEY} (set ADMIN_KEY env to change)`);
});