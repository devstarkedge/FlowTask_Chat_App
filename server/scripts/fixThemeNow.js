#!/usr/bin/env node

/**
 * This script will migrate all users with old theme schema to new schema.
 * Can be run while the server is running.
 * 
 * Usage:
 *   node server/scripts/fixThemeNow.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI not found in .env file');
  console.error('   Please ensure server/.env exists with MONGO_URI');
  process.exit(1);
}

console.log('🚀 Starting emergency theme migration...\n');

async function fixTheme() {
  let connection;
  
  try {
    console.log('🔌 Connecting to MongoDB...');
    connection = await mongoose.connect(MONGO_URI);
    console.log('✅ Connected!\n');

    const db = mongoose.connection.db;
    const users = db.collection('chatusers');

    // Find users with old theme format
    console.log('🔍 Looking for users with old theme format...');
    const oldFormatUsers = await users.find({
      $or: [
        { 'chatPreferences.theme': { $type: 'string' } },
        { 'chatPreferences.theme.mode': { $exists: false } },
      ],
    }).toArray();

    if (oldFormatUsers.length === 0) {
      console.log('✅ All users already migrated! Nothing to do.\n');
      return;
    }

    console.log(`📊 Found ${oldFormatUsers.length} users to migrate\n`);

    let fixed = 0;
    let failed = 0;

    for (const user of oldFormatUsers) {
      try {
        const oldTheme = user.chatPreferences?.theme;
        const oldSidebarTheme = user.chatPreferences?.sidebarTheme;
        
        // Determine mode
        let mode = 'system';
        if (typeof oldTheme === 'string') {
          mode = ['light', 'dark', 'system'].includes(oldTheme) ? oldTheme : 'system';
        }

        // Build new theme
        const newTheme = {
          mode: mode,
          sidebarTheme: oldSidebarTheme || 'aubergine',
          accentColor: 'blue',
          customColors: {},
        };

        // Update user
        await users.updateOne(
          { _id: user._id },
          {
            $set: { 'chatPreferences.theme': newTheme },
            $unset: { 
              'chatPreferences.sidebarTheme': '',
              'chatPreferences.customTheme': '',
            },
          }
        );

        fixed++;
        const email = user.email || user.name || user._id.toString();
        console.log(`✅ [${fixed}/${oldFormatUsers.length}] Fixed: ${email}`);
      } catch (err) {
        failed++;
        console.error(`❌ Failed: ${user.email || user._id}`, err.message);
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📈 MIGRATION COMPLETE!');
    console.log('='.repeat(50));
    console.log(`✅ Successfully migrated: ${fixed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📊 Total processed: ${oldFormatUsers.length}`);
    console.log('='.repeat(50) + '\n');

    if (failed > 0) {
      console.log('⚠️  Some users failed to migrate. Check errors above.');
    } else {
      console.log('🎉 All users migrated successfully!');
      console.log('💡 You can now use the theme API without errors.\n');
    }

  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    if (connection) {
      await mongoose.disconnect();
      console.log('👋 Disconnected from MongoDB\n');
    }
    process.exit(0);
  }
}

fixTheme();
