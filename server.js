// server.js - minimal Express server to accept map uploads, store units JSON, and compute routes
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
const { solveTSP } = require('./tsp');

const { ocrRoutes } = require ("./routes/ocr.js");
const { detectUnits } = require ("./ocr.js" );

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));


const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });


// serve uploaded images/static
app.use('/maps', express.static(DATA_DIR));


const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DATA_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// POST /maps - upload image and create an empty map JSON
app.post('/maps', upload.single('map'), async (req, res) => {
  console.log('Upload endpoint hit!');
  const file = req.file;
  if (!file) return res.status(400).send({ error: 'No file uploaded' });
  const mapId = path.basename(file.filename, path.extname(file.filename));
  // Create initial map JSON
  const imagePath = req.file.path;
  console.log('Starting OCR detection for image:', imagePath);
  
  let detected = [];
  try {
    detected = await detectUnits(imagePath);
    console.log('OCR detection completed. Found units:', detected);
  } catch (error) {
    console.error('Error during OCR detection:', error);
    detected = []; // fallback to empty array
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


// GET /maps/:mapId - fetch map JSON
app.get('/maps/:mapId', (req, res) => {
  const mapId = req.params.mapId;
  const jsonPath = path.join(DATA_DIR, `${mapId}.json`);
  if (!fs.existsSync(jsonPath)) return res.status(404).send({ error: 'Map not found' });
  const mapJson = JSON.parse(fs.readFileSync(jsonPath));
  res.send(mapJson);
});

// POST /maps/:mapId/units - save units array
app.post('/maps/:mapId/units', (req, res) => {
  const mapId = req.params.mapId;
  const jsonPath = path.join(DATA_DIR, `${mapId}.json`);
  if (!fs.existsSync(jsonPath)) return res.status(404).send({ error: 'Map not found' });
  const mapJson = JSON.parse(fs.readFileSync(jsonPath));
  const units = req.body.units || [];
  mapJson.units = units;
  fs.writeFileSync(jsonPath, JSON.stringify(mapJson, null, 2));
  res.send(mapJson);
});


// POST /maps/:mapId/route - compute route given list of unitNumbers and optional startUnit
app.post('/maps/:mapId/route', (req, res) => {
  const mapId = req.params.mapId;
  const jsonPath = path.join(DATA_DIR, `${mapId}.json`);
  if (!fs.existsSync(jsonPath)) return res.status(404).send({ error: 'Map not found' });
  const mapJson = JSON.parse(fs.readFileSync(jsonPath));
  const requested = req.body.units || [];
  const startUnit = req.body.startUnit || null; // optional
  const returnToStart = req.body.returnToStart ?? true;

  // Build points list (start first)
  const unitMap = {};
  for (const u of mapJson.units) unitMap[u.unit] = u;
  const missing = requested.filter(u => !unitMap[u]);
  if (missing.length) return res.status(400).send({ error: 'Some units not found', missing });


  // start candidate: if provided, put first; else default to first requested
  let start = startUnit && unitMap[startUnit] ? startUnit : requested[0];
  const orderedUnits = [start].concat(requested.filter(u => u !== start));


  // Create points array with {id,x,y,floor}
  const points = orderedUnits.map(u => {
    const r = unitMap[u];
    return { id: r.unit, x: r.x, y: r.y, floor: r.floor || 0 };
  });


  // Solve TSP
  const { orderedIdx, length } = solveTSP(points, { floorPenalty: 0.02, returnToStart });
  const ordered = orderedIdx.map(i => points[i].id);
  const routePath = orderedIdx.map(i => ({ id: points[i].id, x: points[i].x, y: points[i].y }));


  res.send({ route: ordered, length, path: routePath });
});

require('dotenv').config();

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));

