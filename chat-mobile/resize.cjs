const Jimp = require('jimp');

async function makeSquare(inputPath, outputPath) {
  try {
    const image = await Jimp.read(inputPath);
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    
    if (width === height) {
      console.log('Image is already square.');
      return;
    }
    
    const size = Math.max(width, height);
    
    // Create a new square transparent image
    const background = new Jimp(size, size, 0x00000000); // Transparent
    
    // Calculate position to center the original image
    const x = Math.floor((size - width) / 2);
    const y = Math.floor((size - height) / 2);
    
    // Composite the original image onto the background
    background.composite(image, x, y);
    
    // Save it
    await background.writeAsync(outputPath);
    console.log(`Successfully made square image and saved to ${outputPath}`);
  } catch (err) {
    console.error('Error:', err);
  }
}

makeSquare('./assets/Vector.png', './assets/Vector.png');
