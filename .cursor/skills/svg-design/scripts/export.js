#!/usr/bin/env node

/**
 * SVG Export Pipeline
 * Rasterizes SVG to PNG at standard sizes and generates ICO
 * Usage: node export.js <input.svg> <output-dir>
 */

const sharp = require('sharp');
const toIco = require('to-ico');
const fs = require('fs');
const path = require('path');

const SIZES = [16, 32, 48, 192, 512, 1024, 2048];
const ICO_SIZES = [16, 32];

async function exportSvg(inputPath, outputDir) {
  // Validate input
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  if (!inputPath.toLowerCase().endsWith('.svg')) {
    console.error('Error: Input file must be an SVG');
    process.exit(1);
  }

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const baseName = path.basename(inputPath, '.svg');
  console.log(`Exporting ${baseName}.svg to ${outputDir}...\n`);

  // Read SVG once
  const svgBuffer = fs.readFileSync(inputPath);

  // Generate PNGs at all sizes
  const pngBuffers = {};
  for (const size of SIZES) {
    const outputPath = path.join(outputDir, `${baseName}-${size}.png`);
    await sharp(svgBuffer)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(outputPath);
    
    pngBuffers[size] = await sharp(svgBuffer)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toBuffer();
    
    console.log(`  ✓ ${baseName}-${size}.png`);
  }

  // Generate ICO from 16x16 and 32x32
  const icoBuffers = ICO_SIZES.map(size => pngBuffers[size]);
  const icoBuffer = await toIco(icoBuffers);
  const icoPath = path.join(outputDir, 'favicon.ico');
  fs.writeFileSync(icoPath, icoBuffer);
  console.log(`  ✓ favicon.ico (16x16 + 32x32)`);

  console.log(`\nExport complete! Generated ${SIZES.length} PNGs + 1 ICO`);
}

// CLI interface
const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error('Usage: node export.js <input.svg> <output-dir>');
  console.error('Example: node export.js logo.svg ./public/logos');
  process.exit(1);
}

const [inputPath, outputDir] = args;
exportSvg(inputPath, outputDir).catch(err => {
  console.error('Export failed:', err.message);
  process.exit(1);
});
