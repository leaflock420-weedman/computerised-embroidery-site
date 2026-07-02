const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const archiver = require('archiver');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 8765;
const ROOT = __dirname;
const UPLOADS = path.join(ROOT, 'uploads');
const ORDERS = path.join(ROOT, 'data', 'orders');

[UPLOADS, path.join(UPLOADS, 'original'), path.join(UPLOADS, 'preview'), path.join(UPLOADS, 'digitize'), ORDERS].forEach(d => {
  fs.mkdirSync(d, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(UPLOADS, 'original')),
  filename: (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

app.use(express.json({ limit: '2mb' }));
app.use(express.static(ROOT));
app.use('/uploads', express.static(UPLOADS));

async function processArtwork(filePath, originalName) {
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

    await image
      .clone()
      .resize(400, 400, { fit: 'inside' })
      .png({ colours: 8, dither: 0 })
      .toFile(digitizePath);

    const { dominant } = await image.stats();
    meta.colors = [
      { r: Math.round(dominant.r), g: Math.round(dominant.g), b: Math.round(dominant.b) },
    ];
    meta.estimatedStitches = Math.round((info.width || 500) * (info.height || 500) / 80);
    meta.digitizeNote = 'Auto-preview generated. Original retained for manual digitizing if needed.';
    meta.previewUrl = `/uploads/preview/${id}.png`;
    meta.digitizePreviewUrl = `/uploads/digitize/${id}.png`;
    meta.originalUrl = `/uploads/original/${path.basename(filePath)}`;

    const metaPath = path.join(UPLOADS, 'digitize', `${id}.json`);
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    return meta;
  } catch (err) {
    meta.error = err.message;
    meta.digitizeNote = 'Could not auto-process — original file saved for manual digitizing.';
    meta.originalUrl = `/uploads/original/${path.basename(filePath)}`;
    const metaPath = path.join(UPLOADS, 'digitize', `${id}.json`);
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    return meta;
  }
}

app.post('/api/upload-artwork', upload.single('artwork'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No artwork file' });
  try {
    const clientMeta = req.body.meta ? JSON.parse(req.body.meta) : {};
    const result = await processArtwork(req.file.path, req.file.originalname);
    res.json({ ...result, clientMeta });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/export-design', express.json({ limit: '50mb' }), (req, res) => {
  const { spec, views, artworkFileName } = req.body || {};
  if (!spec || !views?.length) return res.status(400).json({ error: 'Missing export data' });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="embroidery-${spec.product?.sku || 'design'}.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', err => res.status(500).end(err.message));
  archive.pipe(res);

  archive.append(JSON.stringify(spec, null, 2), { name: 'embroidery-spec.json' });
  archive.append(
    'Production package from Computerised Embroidery Design Studio.\n' +
    'Artwork PNGs are at 300 DPI. Import embroidery-spec.json for placement dimensions.\n' +
    'For DST/PES machine files, digitize at https://emberdesign.net/ or send to compemb@onthenet.com.au\n',
    { name: 'README.txt' },
  );

  views.forEach(v => {
    if (v.artworkPng) archive.append(Buffer.from(v.artworkPng, 'base64'), { name: `artwork-${v.view}-300dpi.png` });
    if (v.mockupPng) archive.append(Buffer.from(v.mockupPng, 'base64'), { name: `placement-${v.view}.png` });
  });

  if (artworkFileName) archive.append(`Original file: ${artworkFileName}\n`, { name: 'original-filename.txt' });
  archive.finalize();
});

app.post('/api/submit-order', (req, res) => {
  const order = { ...req.body, id: uuidv4(), receivedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(ORDERS, `${order.id}.json`), JSON.stringify(order, null, 2));
  res.json({ ok: true, orderId: order.id });
});

app.get('/api/orders', (_req, res) => {
  const files = fs.readdirSync(ORDERS).filter(f => f.endsWith('.json'));
  res.json(files.map(f => JSON.parse(fs.readFileSync(path.join(ORDERS, f), 'utf8'))));
});

app.listen(PORT, () => {
  console.log(`Computerised Embroidery site → http://localhost:${PORT}`);
  console.log(`Designer → http://localhost:${PORT}/designer.html`);
});