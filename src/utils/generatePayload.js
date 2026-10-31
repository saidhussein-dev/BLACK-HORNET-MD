const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function generateTestPayload() {
  const outputDir = path.join(process.cwd(), 'src', 'storage');
  const outputPath = path.join(outputDir, 'crash.webp');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const width = 512;
  const height = 512;
  const totalFrames = 150;

  console.log(`[GENERATOR] Creating ${totalFrames} high-overhead frames...`);

  const frames = [];
  for (let i = 0; i < totalFrames; i++) {
    const r = (i * 7) % 256;
    const g = (i * 13) % 256;
    const b = (i * 19) % 256;

    const frameBuffer = await sharp({
      create: {
        width: width,
        height: height,
        channels: 3,
        background: { r, g, b }
      }
    })
    .png()
    .toBuffer();

    frames.push(frameBuffer);
  }

  console.log('[GENERATOR] Compiling frames into animated WebP container...');

  await sharp(frames, { animated: true })
    .toFormat('webp', {
      loop: 0,
      delay: 1,
      quality: 80
    })
    .toFile(outputPath);

  console.log(`[GENERATOR] Target payload built successfully at: ${outputPath}`);
}

// Check if run directly from package.json script execution
if (require.main === module) {
  generateTestPayload().catch(console.error);
}

module.exports = { generateTestPayload };
