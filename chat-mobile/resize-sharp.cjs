const sharp = require('sharp');

async function makeSquare() {
  try {
    const inputPath = './assets/Vector.png';
    const outputPath = './assets/Vector-square.png';

    const metadata = await sharp(inputPath).metadata();
    const size = Math.max(metadata.width, metadata.height);

    await sharp(inputPath)
      .extend({
        top: Math.floor((size - metadata.height) / 2),
        bottom: Math.ceil((size - metadata.height) / 2),
        left: Math.floor((size - metadata.width) / 2),
        right: Math.ceil((size - metadata.width) / 2),
        background: { r: 0, g: 0, b: 0, alpha: 0 } // transparent background
      })
      .toFile(outputPath);
      
    console.log('Successfully resized to ' + outputPath);
  } catch (err) {
    console.error(err);
  }
}

makeSquare();
