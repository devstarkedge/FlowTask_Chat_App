/**
 * One-time migration: Fix raw file assets that were corrupted by the old
 * upload service which rewrote /image/upload/ → /raw/upload/ in secureUrl.
 *
 * Cloudinary stores ALL assets (including PDFs and other "raw" files) under
 * /image/upload/. The old logic incorrectly assumed raw files needed /raw/upload/
 * paths, causing 404 errors on preview.
 *
 * This script finds any assets with /raw/upload/ in secureUrl and corrects
 * them back to /image/upload/.
 *
 * Usage: node server/scripts/fix-raw-urls.js [--fix]
 *
 * Default: dry-run mode (shows what would be fixed without making changes).
 * Pass --fix to actually update the database.
 */

import mongoose from 'mongoose';
import FileAsset from '../modules/files/FileAsset.model.js';
import env from '../config/environment.js';

const isDryRun = !process.argv.includes('--fix');

console.log('═══════════════════════════════════════════════════');
console.log('  Fix Corrupted URLs — /raw/upload/ → /image/upload/');
console.log('═══════════════════════════════════════════════════');
console.log(`Mode: ${isDryRun ? '🔍 DRY RUN (no changes)' : '🔧 FIX MODE (updating DB)'}\n`);

try {
  await mongoose.connect(env.MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  // Find all assets where secureUrl was corrupted to /raw/upload/
  const brokenAssets = await FileAsset.find({
    secureUrl: { $regex: '/raw/upload/' },
    status: 'available',
  });

  console.log(`Found ${brokenAssets.length} asset(s) with corrupted /raw/upload/ URL\n`);

  if (brokenAssets.length === 0) {
    console.log('✅ No corrupted URLs found. Database is clean.\n');
  } else {
    let fixed = 0;
    let verified = 0;
    let failed = 0;

    for (const asset of brokenAssets) {
      const oldUrl = asset.secureUrl;
      const newUrl = oldUrl.replace('/raw/upload/', '/image/upload/');

      console.log(`📄 ${asset.originalName}`);
      console.log(`   assetId:     ${asset._id}`);
      console.log(`   mimeType:    ${asset.mimeType}`);
      console.log(`   resourceType:${asset.resourceType}`);
      console.log(`   OLD URL:     ${oldUrl}`);
      console.log(`   NEW URL:     ${newUrl}`);

      // Verify the corrected URL is accessible
      try {
        const response = await fetch(newUrl, { method: 'HEAD' });
        if (response.ok) {
          console.log(`   ✅ Corrected URL accessible (${response.status})`);
          verified++;
        } else {
          console.log(`   ⚠️  Corrected URL returned ${response.status} ${response.statusText}`);
        }
      } catch (err) {
        console.log(`   ⚠️  Could not verify corrected URL: ${err.message}`);
      }

      if (!isDryRun) {
        try {
          asset.secureUrl = newUrl;
          await asset.save();
          console.log(`   ✅ Database updated`);
          fixed++;
        } catch (err) {
          console.log(`   ❌ Failed to update: ${err.message}`);
          failed++;
        }
      }
      console.log('');
    }

    console.log('═══════════════════════════════════════════════════');
    console.log(`  Total affected: ${brokenAssets.length}`);
    console.log(`  URLs verified:  ${verified}`);
    if (!isDryRun) {
      console.log(`  Fixed in DB:    ${fixed}`);
      console.log(`  Failed:         ${failed}`);
    } else {
      console.log(`\n  🔧 Run with --fix to apply changes:`);
      console.log(`     node server/scripts/fix-raw-urls.js --fix`);
    }
    console.log('═══════════════════════════════════════════════════\n');
  }

} catch (error) {
  console.error('❌ Migration failed:', error.message);
  console.error(error.stack);
  process.exit(1);
} finally {
  await mongoose.disconnect();
  console.log('👋 Disconnected from MongoDB');
  process.exit(0);
}
