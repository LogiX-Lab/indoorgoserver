const Tesseract = require("tesseract.js");
const sharp = require("sharp");
const path = require("path");

async function detectUnits(imagePath) {
  try {
    console.log('=== NEW OCR FUNCTION CALLED ===');
    console.log('Processing image:', imagePath);
    
    // Preprocess for better OCR accuracy
    const processedPath = path.join(
      path.dirname(imagePath),
      "processed_" + path.basename(imagePath)
    );
    
    console.log('Creating processed image at:', processedPath);
    
    // Get original image dimensions
    const originalMeta = await sharp(imagePath).metadata();
    console.log('Original image dimensions:', originalMeta.width, 'x', originalMeta.height);
    
    await sharp(imagePath)
      .resize({ width: 1200 }) // larger upscale for better text
      .grayscale()
      .normalize()
      .sharpen({ sigma: 1 })
      .linear(1.5, -(128 * 1.5) + 128) // increase contrast
      .toFile(processedPath);

    console.log('Running OCR on processed image...');
    const result = await Tesseract.recognize(processedPath, "eng", {
      tessedit_pageseg_mode: '6',
      tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz '
    });
    
    const { data } = result;

    console.log('OCR completed. Raw text found:', data.text);
    console.log('Full OCR data keys:', Object.keys(data));
    
    // Parse OCR results with proper coordinates
    const detected = [];
    
    // Try to get coordinates from blocks/paragraphs/words structure
    if (data.blocks) {
      console.log('Processing blocks for coordinates...');
      data.blocks.forEach(block => {
        if (block.paragraphs) {
          block.paragraphs.forEach(paragraph => {
            if (paragraph.words) {
              paragraph.words.forEach(word => {
                const text = word.text ? word.text.trim() : '';
                if (/^\d{2,5}$/.test(text) && word.bbox) {
                  // Calculate coordinates relative to processed image
                  const processedX = (word.bbox.x0 + word.bbox.x1) / 2;
                  const processedY = (word.bbox.y0 + word.bbox.y1) / 2;
                  
                  // Scale back to original image proportions
                  const scaleRatio = originalMeta.width / 1200;
                  const originalX = processedX * scaleRatio;
                  const originalY = processedY * scaleRatio;
                  
                  // Normalize to 0-1 range based on original dimensions
                  const x = originalX / originalMeta.width;
                  const y = originalY / originalMeta.height;
                  
                  detected.push({
                    unit: text,
                    x: Math.max(0, Math.min(1, x)),
                    y: Math.max(0, Math.min(1, y))
                  });
                  console.log(`Added unit ${text} at original coords (${originalX.toFixed(0)}, ${originalY.toFixed(0)}) normalized (${x.toFixed(3)}, ${y.toFixed(3)})`);
                }
              });
            }
          });
        }
      });
    }
    
    // Fallback: extract from raw text with dummy coordinates if no blocks found
    if (detected.length === 0 && data.text) {
      console.log('No blocks found, using text fallback...');
      const numbers = data.text.match(/\d{2,5}/g) || [];
      console.log('Numbers from text:', numbers);
      
      numbers.forEach((num, index) => {
        detected.push({
          unit: num,
          x: 0.2 + (index * 0.15),
          y: 0.2 + (index * 0.15)
        });
      });
    }
    
    console.log('Final detected units:', detected);
    return detected;
  } catch (error) {
    console.error("OCR detection error:", error);
    return [];
  }
}

module.exports = { detectUnits };
