#!/usr/bin/env node
/**
 * Export SVG logo to PNG and ICO formats
 * Usage: node scripts/export-logo.js <input.svg> <output-dir>
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SIZES = [16, 32, 48, 180, 192, 512, 1024, 1200, 2048];
const ICO_SIZES = [16, 32];

async function exportLogo(inputPath, outputDir) {
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

  const baseName = 'logo';
  console.log(`Exporting ${path.basename(inputPath)} to ${outputDir}...\n`);

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

  // Generate ICO from 16x16 and 32x32 PNGs
  // ICO format: header + directory entries + image data
  const icoBuffers = ICO_SIZES.map(size => pngBuffers[size]);
  
  // ICO header: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);  // Reserved
  header.writeUInt16LE(1, 2);  // Type (1 = ICO)
  header.writeUInt16LE(icoBuffers.length, 4);  // Number of images

  // Calculate offsets
  const dirSize = icoBuffers.length * 16;  // Each entry is 16 bytes
  let dataOffset = 6 + dirSize;

  // Build directory entries and collect image data
  const dirEntries = [];
  const imageData = [];

  for (let i = 0; i < icoBuffers.length; i++) {
    const size = ICO_SIZES[i];
    const pngData = icoBuffers[i];

    // Directory entry: 16 bytes
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);  // Width
    entry.writeUInt8(size === 256 ? 0 : size, 1);  // Height
    entry.writeUInt8(0, 2);  // Color palette
    entry.writeUInt8(0, 3);  // Reserved
    entry.writeUInt16LE(1, 4);  // Color planes
    entry.writeUInt16LE(32, 6);  // Bits per pixel
    entry.writeUInt32LE(pngData.length, 8);  // Size of image data
    entry.writeUInt32LE(dataOffset, 12);  // Offset to image data

    dirEntries.push(entry);
    imageData.push(pngData);
    dataOffset += pngData.length;
  }

  // Combine all parts
  const icoBuffer = Buffer.concat([header, ...dirEntries, ...imageData]);
  const icoPath = path.join(outputDir, 'favicon.ico');
  fs.writeFileSync(icoPath, icoBuffer);
  console.log(`  ✓ favicon.ico (16x16 + 32x32)`);

  console.log(`\nExport complete! Generated ${SIZES.length} PNGs + 1 ICO`);
}

// CLI interface
const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error('Usage: node scripts/export-logo.js <input.svg> <output-dir>');
  console.error('Example: node scripts/export-logo.js logo.svg ./public/logos');
  process.exit(1);
}

const [inputPath, outputDir] = args;
exportLogo(inputPath, outputDir).catch(err => {
  console.error('Export failed:', err.message);
  process.exit(1);
});
