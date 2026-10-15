import net from 'node:net';
import fs from 'node:fs';
import { AppError } from '../middleware/errorHandler.js';

export function scanSettings(source = process.env) {
  const mode = source.UPLOAD_SCAN_MODE || (source.NODE_ENV === 'production' ? 'clamd' : 'off');
  if (!['off', 'clamd'].includes(mode) || (source.NODE_ENV === 'production' && mode !== 'clamd')) {
    throw new AppError('Upload malware scanning is required in production', 503, 'UPLOAD_SCANNER_UNAVAILABLE');
  }
  return {mode, host:source.CLAMD_HOST || '127.0.0.1', port:Number(source.CLAMD_PORT || 3310)};
}

let active = 0;
// INSTREAM sends file contents, never caller-supplied shell commands or paths.
// clamd must be a TaskChat-controlled private daemon, not a public TCP service.
export async function scanUpload(file, {source = process.env, timeoutMs = 30000} = {}) {
  const settings = scanSettings(source);
  if (settings.mode === 'off') return {status:'not-scanned'};
  if (typeof file?.path !== 'string' || !file.path || active >= 4 || !Number.isInteger(settings.port) || settings.port < 1 || settings.port > 65535) {
    throw new AppError('Upload scanner is unavailable. Try again later.', 503, 'UPLOAD_SCANNER_UNAVAILABLE');
  }
  active++;
  try {
    await new Promise((resolve, reject) => {
      const socket = net.createConnection({host:settings.host, port:settings.port});
      const stream = fs.createReadStream(file.path, {highWaterMark:64 * 1024});
      let response = '', settled = false;
      const finish = error => {
        if (settled) return;
        settled = true;clearTimeout(deadline);stream.destroy();socket.destroy();
        error ? reject(error) : resolve();
      };
      const unavailable = () => finish(new AppError('Upload scanner is unavailable. File was not accepted.', 503, 'UPLOAD_SCANNER_UNAVAILABLE'));
      const deadline = setTimeout(unavailable, timeoutMs);
      socket.on('error', unavailable);stream.on('error', unavailable);
      socket.on('end', () => {if (!settled) unavailable();});
      socket.on('data', chunk => {
        response += chunk.toString('utf8');
        if (response.length > 4096) {unavailable();return;}
        if (!response.includes('\0')) return;
        const answer = response.split('\0')[0];
        if (answer === 'stream: OK') finish();
        else if (/^stream: .+ FOUND$/.test(answer)) finish(new AppError('This file was blocked by the malware scanner.', 400, 'UNSAFE_UPLOAD'));
        else unavailable();
      });
      socket.once('connect', async () => {
        try {
          socket.write('zINSTREAM\0');
          for await (const chunk of stream) {
            if (settled) return;
            const length = Buffer.alloc(4);length.writeUInt32BE(chunk.length);
            socket.write(length);
            if (!socket.write(chunk)) await new Promise((resolve, reject) => {
              const cleanup=()=>{socket.off('drain',drained);socket.off('close',closed);socket.off('error',closed);};
              const drained=()=>{cleanup();resolve();};
              const closed=()=>{cleanup();reject(new Error('Scanner disconnected'));};
              socket.once('drain',drained);socket.once('close',closed);socket.once('error',closed);
            });
          }
          if (!settled) socket.write(Buffer.alloc(4));
        } catch {if (!settled) unavailable();}
      });
    });
    return {status:'clean'};
  } finally {active--;}
}

export async function scanUploadedFiles(req, _res, next) {
  const files = req.files || (req.file ? [req.file] : []);
  try {
    for (const file of files) file.securityScan = await scanUpload(file);
    next();
  } catch (error) {
    // No batch member is published if one is unsafe or scanning is unavailable.
    await Promise.all(files.map(file => fs.promises.unlink(file.path).catch(() => {})));
    next(error);
  }
}
