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
app.use(express.static(ROOT));
app.use('/uploads', express.static(UPLOADS));

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
        meta.digitizeNote = `Auto-digitized: ${job.stitchCount} stitches, ${job.colorCount} colours. Review in Production Hub.`;
      } else if (job.error) {
        meta.digitizeNote = `Preview ready. Production digitize pending: ${job.error}`;
      }
      fs.writeFileSync(path.join(UPLOADS, 'digitize', `${id}.json`), JSON.stringify(meta, null, 2));
    });

    meta.digitizeNote = 'Processing production files (DST/PES/JEF)…';
    return meta;
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
    res.json({ ...result, clientMeta });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/digitize-status/:id', (req, res) => {
  const job = loadJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
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
    'Computerised Embroidery — production package.\n' +
    'DST/PES/JEF files are in the Production Hub after auto-digitizing.\n' +
    'Workers: open /admin.html to review and download machine files.\n',
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
  const order = { ...req.body, id: uuidv4(), receivedAt: new Date().toISOString(), status: 'pending' };
  if (order.artwork?.id) {
    const job = loadJob(order.artwork.id);
    order.productionJobId = order.artwork.id;
    order.productionStatus = job?.status || 'unknown';
  }
  fs.writeFileSync(path.join(ORDERS, `${order.id}.json`), JSON.stringify(order, null, 2));
  res.json({ ok: true, orderId: order.id });
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

app.listen(PORT, () => {
  console.log(`Computerised Embroidery site → http://localhost:${PORT}`);
  console.log(`Designer        → http://localhost:${PORT}/designer.html`);
  console.log(`Production Hub  → http://localhost:${PORT}/admin.html`);
  console.log(`Admin key       → ${ADMIN_KEY} (set ADMIN_KEY env to change)`);
});