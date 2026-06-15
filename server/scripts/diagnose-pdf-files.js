/**
 * Diagnostic script to check PDF files in MongoDB
 * 
 * Usage: node --experimental-specifier-resolution=node server/scripts/diagnose-pdf-files.js
 * 
 * This script:
 * 1. Finds all PDF files in the database
 * 2. Verifies their secureUrl is valid
 * 3. Tests if Cloudinary URLs are accessible
 * 4. Reports any issues
 */

import mongoose from 'mongoose';
import FileAsset from '../modules/files/FileAsset.model.js';
import env from '../config/environment.js';

console.log('🔍 Starting PDF file diagnostic...\n');

try {
  // Connect to database
  console.log('📡 Connecting to MongoDB...');
  await mongoose.connect(env.MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  // Find all PDF files
  const pdfFiles = await FileAsset.find({
    $or: [
      { mimeType: 'application/pdf' },
      { originalName: { $regex: /\.pdf$/i } },
    ],
  }).lean();

  console.log(`📊 Found ${pdfFiles.length} PDF files\n`);

  if (pdfFiles.length === 0) {
    console.log('ℹ️  No PDF files found in database.');
    console.log('💡 Upload a PDF file and try again.\n');
    await mongoose.disconnect();
    process.exit(0);
  }

  let validCount = 0;
  let invalidCount = 0;
  let inaccessibleCount = 0;

  for (const pdf of pdfFiles) {
    console.log('--- PDF Record ---');
    console.log({
      _id: pdf._id.toString(),
      originalName: pdf.originalName,
      mimeType: pdf.mimeType,
      resourceType: pdf.resourceType,
      secureUrl: pdf.secureUrl,
      secureUrlValid: pdf.secureUrl && pdf.secureUrl !== '/placeholder-loading',
      status: pdf.status,
      publicId: pdf.publicId,
    });

    // Check if secureUrl is valid
    const hasValidUrl = pdf.secureUrl && 
                        pdf.secureUrl !== '/placeholder-loading' && 
                        !pdf.secureUrl.startsWith('/');

    if (!hasValidUrl) {
      console.log('  ❌ INVALID: secureUrl is missing or placeholder');
      invalidCount++;
      continue;
    }

    if (pdf.status !== 'available') {
      console.log(`  ⚠️  WARNING: Status is '${pdf.status}' (expected 'available')`);
    }

    if (pdf.resourceType !== 'raw') {
      console.log(`  ⚠️  WARNING: resourceType is '${pdf.resourceType}' (expected 'raw' for PDFs)`);
    }

    // Check if Cloudinary URL is accessible
    try {
      const response = await fetch(pdf.secureUrl, { method: 'HEAD' });
      
      if (response.ok) {
        console.log(`  ✅ Cloudinary accessible: ${response.status} ${response.statusText}`);
        validCount++;
      } else {
        console.log(`  ❌ Cloudinary returned: ${response.status} ${response.statusText}`);
        inaccessibleCount++;
      }
    } catch (err) {
      console.log(`  ❌ Cloudinary HEAD failed: ${err.message}`);
      inaccessibleCount++;
    }

    console.log('');
  }

  // Summary
  console.log('\n========== DIAGNOSTIC SUMMARY ==========');
  console.log(`Total PDF files: ${pdfFiles.length}`);
  console.log(`✅ Valid and accessible: ${validCount}`);
  console.log(`❌ Invalid secureUrl: ${invalidCount}`);
  console.log(`❌ Inaccessible on Cloudinary: ${inaccessibleCount}`);
  console.log('========================================\n');

  if (invalidCount > 0) {
    console.log('⚠️  ACTION REQUIRED: Some PDFs have invalid secureUrl values.');
    console.log('💡 This may indicate incomplete uploads or database corruption.\n');
  }

  if (inaccessibleCount > 0) {
    console.log('⚠️  ACTION REQUIRED: Some PDFs are not accessible on Cloudinary.');
    console.log('💡 This may indicate:');
    console.log('   - Files were deleted from Cloudinary');
    console.log('   - Incorrect resource_type in upload');
    console.log('   - Cloudinary authentication issues\n');
  }

  if (validCount === pdfFiles.length) {
    console.log('✅ All PDF files are valid and accessible!\n');
  }

} catch (error) {
  console.error('❌ Diagnostic failed:', error.message);
  console.error(error.stack);
  process.exit(1);
} finally {
  await mongoose.disconnect();
  console.log('👋 Disconnected from MongoDB\n');
  process.exit(0);
}
