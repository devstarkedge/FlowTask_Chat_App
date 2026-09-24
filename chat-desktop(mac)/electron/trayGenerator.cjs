const fs = require('fs');
const zlib = require('zlib');
const { nativeImage } = require('electron');

// CRC32 lookup table for fast in-memory PNG encoding
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function calcCRC32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(4 + 4 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4);
  data.copy(buf, 8);
  const typeAndData = buf.slice(4, 8 + len);
  const crc = calcCRC32(typeAndData);
  buf.writeUInt32BE(crc, 8 + len);
  return buf;
}

function encodePNG(width, height, rgbaBuffer) {
  const rawLines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawLines[y * (1 + width * 4)] = 0;
    rgbaBuffer.copy(rawLines, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(rawLines, { level: 9 });
  
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

function decodePNG(buffer) {
  let pos = 8;
  let idat = [];
  let width = 0, height = 0;
  
  while (pos < buffer.length) {
    const len = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    if (type === 'IHDR') {
      width = buffer.readUInt32BE(pos + 8);
      height = buffer.readUInt32BE(pos + 12);
    } else if (type === 'IDAT') {
      idat.push(buffer.slice(pos + 8, pos + 8 + len));
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  
  const decompressed = zlib.inflateSync(Buffer.concat(idat));
  const stride = 1 + width * 4;
  const pixels = Buffer.alloc(width * height * 4);
  let prevLine = Buffer.alloc(width * 4);
  
  for (let y = 0; y < height; y++) {
    const filterType = decompressed[y * stride];
    const line = decompressed.slice(y * stride + 1, (y + 1) * stride);
    const currLine = Buffer.alloc(width * 4);
    
    for (let x = 0; x < width * 4; x++) {
      const filt = line[x];
      let val = 0;
      if (filterType === 0) val = filt;
      else if (filterType === 1) {
        const left = x >= 4 ? currLine[x - 4] : 0;
        val = (filt + left) & 0xff;
      } else if (filterType === 2) {
        const up = prevLine[x];
        val = (filt + up) & 0xff;
      } else if (filterType === 3) {
        const left = x >= 4 ? currLine[x - 4] : 0;
        const up = prevLine[x];
        val = (filt + Math.floor((left + up) / 2)) & 0xff;
      } else if (filterType === 4) {
        const left = x >= 4 ? currLine[x - 4] : 0;
        const up = prevLine[x];
        const corner = x >= 4 ? prevLine[x - 4] : 0;
        const p = left + up - corner;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - corner);
        let pr = corner;
        if (pa <= pb && pa <= pc) pr = left;
        else if (pb <= pc) pr = up;
        val = (filt + pr) & 0xff;
      }
      currLine[x] = val;
      pixels[y * width * 4 + x] = val;
    }
    prevLine = currLine;
  }
  
  return { width, height, pixels };
}

/**
 * Dynamically creates a multi-resolution, padded nativeImage tray icon
 * from any source logo image at runtime.
 */
function createDynamicTrayImage(logoPath, isMac = false) {
  try {
    if (!fs.existsSync(logoPath)) {
      return nativeImage.createFromPath(logoPath);
    }

    const fileBuf = fs.readFileSync(logoPath);
    const src = decodePNG(fileBuf);
    
    // Measure bounding box of non-transparent artwork in source image
    let minX = src.width, maxX = 0, minY = src.height, maxY = 0;
    let opaqueCount = 0;
    
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const alpha = src.pixels[(y * src.width + x) * 4 + 3];
        if (alpha > 10) {
          opaqueCount++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    
    if (opaqueCount === 0) {
      minX = 0; maxX = src.width - 1; minY = 0; maxY = src.height - 1;
    }
    
    const artWidth = maxX - minX + 1;
    const artHeight = maxY - minY + 1;
    
    const trayImg = nativeImage.createEmpty();
    const scales = [1, 2, 3, 4];
    
    for (const scale of scales) {
      const canvasSize = 22 * scale;
      const targetArtW = Math.round(canvasSize * 0.65);
      const targetArtH = Math.round(targetArtW * (artHeight / artWidth));
      
      const offsetX = Math.floor((canvasSize - targetArtW) / 2);
      const offsetY = Math.floor((canvasSize - targetArtH) / 2);
      
      const dstBuf = Buffer.alloc(canvasSize * canvasSize * 4);
      
      for (let dy = 0; dy < targetArtH; dy++) {
        const sy = minY + (targetArtH > 1 ? (dy / (targetArtH - 1)) * (artHeight - 1) : 0);
        const sy0 = Math.floor(sy);
        const sy1 = Math.min(src.height - 1, sy0 + 1);
        const fy = sy - sy0;
        
        const targetY = offsetY + dy;
        if (targetY < 0 || targetY >= canvasSize) continue;
        
        for (let dx = 0; dx < targetArtW; dx++) {
          const sx = minX + (targetArtW > 1 ? (dx / (targetArtW - 1)) * (artWidth - 1) : 0);
          const sx0 = Math.floor(sx);
          const sx1 = Math.min(src.width - 1, sx0 + 1);
          const fx = sx - sx0;
          
          const targetX = offsetX + dx;
          if (targetX < 0 || targetX >= canvasSize) continue;
          
          const a00 = src.pixels[(sy0 * src.width + sx0) * 4 + 3];
          const a10 = src.pixels[(sy0 * src.width + sx1) * 4 + 3];
          const a01 = src.pixels[(sy1 * src.width + sx0) * 4 + 3];
          const a11 = src.pixels[(sy1 * src.width + sx1) * 4 + 3];
          
          const alpha = (1 - fy) * ((1 - fx) * a00 + fx * a10) + fy * ((1 - fx) * a01 + fx * a11);
          const alphaInt = Math.min(255, Math.round(alpha));
          
          if (alphaInt > 0) {
            const dstIdx = (targetY * canvasSize + targetX) * 4;
            dstBuf[dstIdx] = 0;     // R
            dstBuf[dstIdx + 1] = 0; // G
            dstBuf[dstIdx + 2] = 0; // B
            dstBuf[dstIdx + 3] = alphaInt; // A (stencil mask for macOS template)
          }
        }
      }
      
      const pngBuffer = encodePNG(canvasSize, canvasSize, dstBuf);
      trayImg.addRepresentation({
        scaleFactor: scale,
        width: canvasSize,
        height: canvasSize,
        buffer: pngBuffer,
      });
    }
    
    if (isMac) {
      trayImg.setTemplateImage(true);
    }
    
    return trayImg;
  } catch (err) {
    console.error('[TaskChat] Failed to generate dynamic tray image:', err);
    const fallback = nativeImage.createFromPath(logoPath);
    if (isMac) fallback.setTemplateImage(true);
    return fallback;
  }
}

module.exports = { createDynamicTrayImage };
