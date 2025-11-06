require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
const { solveTSP } = require('./tsp.js');
const { detectUnits } = require('./ocr.js');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

app.use((req, res, next) => {
  if (req.query.path) {
    req.url = '/' + req.query.path;
    req.path = '/' + req.query.path;
  }
  next();
});

const DATA_DIR = process.env.NODE_ENV === 'production' ? '/tmp/data' : path.join(process.cwd(), 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Serve static files only for image files, not JSON API routes
app.use('/maps', (req, res, next) => {
  if (req.path.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
    express.static(DATA_DIR)(req, res, next);
  } else {
    next();
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DATA_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

app.post('/maps', upload.single('map'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).send({ error: 'No file uploaded' });
  const mapId = path.basename(file.filename, path.extname(file.filename));
  
  let detected = [];
  try {
    detected = await detectUnits(file.path);
  } catch (error) {
    detected = [];
  }

  const mapJson = {
    mapId,
    imageUrl: `/maps/${file.filename}`,
    width: req.body.width || null,
    height: req.body.height || null,
    units: detected
  };
  fs.writeFileSync(path.join(DATA_DIR, `${mapId}.json`), JSON.stringify(mapJson, null, 2));
  res.send(mapJson);
});

app.get('/maps/:mapId', (req, res) => {
  const mapId = req.params.mapId;
  const jsonPath = path.join(DATA_DIR, `${mapId}.json`);
  if (!fs.existsSync(jsonPath)) return res.status(404).send({ error: 'Map not found' });
  const mapJson = JSON.parse(fs.readFileSync(jsonPath));
  res.send(mapJson);
});

app.post('/maps/:mapId/units', (req, res) => {
  const mapId = req.params.mapId;
  const jsonPath = path.join(DATA_DIR, `${mapId}.json`);
  if (!fs.existsSync(jsonPath)) return res.status(404).send({ error: 'Map not found' });
  const mapJson = JSON.parse(fs.readFileSync(jsonPath));
  mapJson.units = req.body.units || [];
  fs.writeFileSync(jsonPath, JSON.stringify(mapJson, null, 2));
  res.send(mapJson);
});

app.post('/maps/:mapId/route', (req, res) => {
  const mapId = req.params.mapId;
  const jsonPath = path.join(DATA_DIR, `${mapId}.json`);
  if (!fs.existsSync(jsonPath)) return res.status(404).send({ error: 'Map not found' });
  const mapJson = JSON.parse(fs.readFileSync(jsonPath));
  const requested = req.body.units || [];
  const startUnit = req.body.startUnit || null;
  const returnToStart = req.body.returnToStart ?? true;

  const unitMap = {};
  for (const u of mapJson.units) unitMap[u.unit] = u;
  const missing = requested.filter(u => !unitMap[u]);
  if (missing.length) return res.status(400).send({ error: 'Some units not found', missing });

  let start = startUnit && unitMap[startUnit] ? startUnit : requested[0];
  const orderedUnits = [start].concat(requested.filter(u => u !== start));

  const points = orderedUnits.map(u => {
    const r = unitMap[u];
    return { id: r.unit, x: r.x, y: r.y, floor: r.floor || 0 };
  });

  const { orderedIdx, length } = solveTSP(points, { floorPenalty: 0.02, returnToStart });
  const ordered = orderedIdx.map(i => points[i].id);
  const routePath = orderedIdx.map(i => ({ id: points[i].id, x: points[i].x, y: points[i].y }));

  res.send({ route: ordered, length, path: routePath });
});

app.get('/', (req, res) => {
  res.send({ message: 'Mall Route API Server', status: 'running' });
});

app.get('*', (req, res) => {
  res.status(404).send({ error: 'Route not found', path: req.path, url: req.url });
});

if (require.main === module) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => console.log(`Server running on ${PORT}`));
}

module.exports = app;