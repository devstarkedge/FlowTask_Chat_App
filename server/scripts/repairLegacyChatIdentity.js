import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import env from '../config/environment.js';
import { repairLegacyChatIdentity } from '../modules/users/legacyChatIdentityRepair.service.js';

try {
  const manifestPath = process.argv[2];
  if (!manifestPath || manifestPath.startsWith('--')) throw new Error('Usage: node scripts/repairLegacyChatIdentity.js manifest.json [--apply]');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  await mongoose.connect(env.MONGO_URI, { autoIndex: false, serverSelectionTimeoutMS: 10000 });
  console.log(JSON.stringify(await repairLegacyChatIdentity(manifest, { apply: process.argv.includes('--apply') }), null, 2));
} catch (error) {
  console.error('Legacy chat identity repair failed:', error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
