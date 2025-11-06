const express = require("express");
const multer = require("multer");
const { detectUnits } = require("../ocr.js");

const upload = multer({ dest: "uploads/" });
const ocrRoutes = express.Router();

ocrRoutes.post("/ocr-detect", upload.single("map"), async (req, res) => {
  try {
    const imagePath = req.file.path;
    const detected = await detectUnits(imagePath);
    res.json({ success: true, units: detected });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = { ocrRoutes };