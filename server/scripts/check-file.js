/**
 * Quick diagnostic for a single file asset
 * 
 * Usage: node server/scripts/check-file.js <assetId>
 * 
 * Example: node server/scripts/check-file.js 6a042a9...
 */

import mongoose from 'mongoose';
import FileAsset from '../modules/files/FileAsset.model.js';
import env from '../config/environment.js';

const assetId = process.argv[2];

if (!assetId) {
  console.error('❌ Please provide an assetId');
  console.log('Usage: node server/scripts/check-file.js <assetId>');
  process.exit(1);
}

console.log('🔍 Checking file asset:', assetId, '\n');

try {
  await mongoose.connect(env.MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const asset = await FileAsset.findById(assetId).lean();

  if (!asset) {
    console.error('❌ File not found in database');
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('📄 File Asset Details:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`_id:            ${asset._id}`);
  console.log(`originalName:   ${asset.originalName}`);
  console.log(`mimeType:       ${asset.mimeType}`);
  console.log(`resourceType:   ${asset.resourceType}`);
  console.log(`fileSize:       ${asset.fileSize} bytes (${(asset.fileSize / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`status:         ${asset.status}`);
  console.log(`publicId:       ${asset.publicId}`);
  console.log(`secureUrl:      ${asset.secureUrl}`);
  console.log(`workspaceId:    ${asset.workspaceId}`);
  console.log(`uploadedBy:     ${asset.uploadedBy}`);
  console.log(`createdAt:      ${asset.createdAt}`);
  console.log(`updatedAt:      ${asset.updatedAt}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Validate secureUrl
  if (!asset.secureUrl || asset.secureUrl === '/placeholder-loading') {
    console.error('❌ INVALID: secureUrl is missing or placeholder');
    console.log('💡 This file upload may not have completed successfully\n');
  } else if (asset.secureUrl.startsWith('/')) {
    console.error('❌ INVALID: secureUrl is a relative path');
    console.log('💡 Expected absolute Cloudinary URL\n');
  } else {
    console.log('✅ secureUrl format is valid\n');
  }

  // Validate resourceType for PDF
  if (asset.mimeType === 'application/pdf' && asset.resourceType !== 'raw') {
    console.warn(`⚠️  WARNING: PDF has resourceType='${asset.resourceType}' (expected 'raw')`);
    console.log('💡 This may cause preview issues\n');
  }

  // Detect URL path mismatch for raw files (root cause of 401 errors)
  if (asset.resourceType === 'raw' && asset.secureUrl?.includes('/image/upload/')) {
    console.error('❌ URL MISMATCH DETECTED: resourceType is "raw" but secureUrl contains /image/upload/');
    console.log('💡 This is the root cause of 401 Unauthorized errors');
    const correctedUrl = asset.secureUrl.replace('/image/upload/', '/raw/upload/');
    console.log(`   Current:   ${asset.secureUrl}`);
    console.log(`   Corrected: ${correctedUrl}`);
    console.log('💡 Run the fix-raw-urls script to fix this: node server/scripts/fix-raw-urls.js\n');
  }

  // Test Cloudinary URL accessibility
  if (asset.secureUrl && asset.secureUrl !== '/placeholder-loading' && !asset.secureUrl.startsWith('/')) {
    console.log('🌐 Testing Cloudinary URL accessibility...');
    try {
      const response = await fetch(asset.secureUrl, { method: 'HEAD' });
      
      if (response.ok) {
        console.log(`✅ Cloudinary accessible: ${response.status} ${response.statusText}`);
        console.log(`   Content-Type: ${response.headers.get('content-type')}`);
        console.log(`   Content-Length: ${response.headers.get('content-length')}\n`);
      } else {
        console.error(`❌ Cloudinary returned: ${response.status} ${response.statusText}`);
        console.log('💡 The file may not exist on Cloudinary or access is restricted\n');
      }
    } catch (err) {
      console.error(`❌ Cloudinary HEAD failed: ${err.message}\n`);
    }

    // Try alternative URL format for raw files
    if (asset.resourceType === 'raw') {
      const cloudName = env.CLOUDINARY_CLOUD_NAME;
      const publicId = asset.publicId;
      const alternativeUrl = `https://res.cloudinary.com/${cloudName}/raw/upload/${publicId}`;
      
      console.log('🌐 Testing alternative raw URL format...');
      console.log(`   URL: ${alternativeUrl}\n`);
      
      try {
        const response = await fetch(alternativeUrl, { method: 'HEAD' });
        
        if (response.ok) {
          console.log(`✅ Alternative URL accessible: ${response.status} ${response.statusText}`);
          console.log(`   Content-Type: ${response.headers.get('content-type')}\n`);
        } else {
          console.log(`ℹ️  Alternative URL returned: ${response.status} ${response.statusText}\n`);
        }
      } catch (err) {
        console.log(`ℹ️  Alternative URL failed: ${err.message}\n`);
      }
    }
  }

  // Summary
  console.log('========== DIAGNOSTIC SUMMARY ==========');
  const hasValidUrl = asset.secureUrl && 
                      asset.secureUrl !== '/placeholder-loading' && 
                      !asset.secureUrl.startsWith('/');
  const correctResourceType = asset.mimeType === 'application/pdf' ? asset.resourceType === 'raw' : true;
  
  if (hasValidUrl && correctResourceType && asset.status === 'available') {
    console.log('✅ File appears to be correctly configured');
    console.log('💡 If preview still fails, check server logs for proxy endpoint errors\n');
  } else {
    console.log('❌ Issues detected that may cause preview failure:');
    if (!hasValidUrl) console.log('   - Invalid or missing secureUrl');
    if (!correctResourceType) console.log('   - Incorrect resourceType for PDF');
    if (asset.status !== 'available') console.log(`   - Status is '${asset.status}' (expected 'available')`);
    console.log('\n💡 Try re-uploading the file or fixing the database record\n');
  }
  console.log('========================================\n');

} catch (error) {
  console.error('❌ Diagnostic failed:', error.message);
  console.error(error.stack);
  process.exit(1);
} finally {
  await mongoose.disconnect();
  console.log('👋 Disconnected from MongoDB\n');
  process.exit(0);
}
