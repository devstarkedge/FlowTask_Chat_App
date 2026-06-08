/**
 * Migration Script: Update ChatUser theme schema from String to Object
 * 
 * BEFORE: chatPreferences.theme = 'dark'
 * AFTER:  chatPreferences.theme = { mode: 'dark', sidebarTheme: 'aubergine', accentColor: 'blue', customColors: {} }
 * 
 * Run: node server/scripts/migrateThemeSchema.js
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
  console.error('❌ MONGO_URI environment variable is required');
  process.exit(1);
}

async function migrate() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('chatusers');

    // Find all users with old string-based theme OR missing theme structure
    const users = await collection.find({
      $or: [
        { 'chatPreferences.theme': { $type: 'string' } },
        { 'chatPreferences.theme': { $exists: false } },
        { 'chatPreferences.theme.mode': { $exists: false } },
      ],
    }).toArray();

    console.log(`📊 Found ${users.length} users to migrate`);

    let migrated = 0;
    let skipped = 0;

    for (const user of users) {
      try {
        const oldTheme = user.chatPreferences?.theme;
        const sidebarTheme = user.chatPreferences?.sidebarTheme || 'aubergine';
        
        // Determine mode from old theme value
        let mode = 'system';
        if (typeof oldTheme === 'string') {
          mode = ['light', 'dark', 'system'].includes(oldTheme) ? oldTheme : 'system';
        }

        // Build new theme object
        const newTheme = {
          mode: mode,
          sidebarTheme: sidebarTheme,
          accentColor: 'blue',
          customColors: {},
        };

        // Use raw MongoDB update to avoid Mongoose validation issues
        await collection.updateOne(
          { _id: user._id },
          {
            $set: {
              'chatPreferences.theme': newTheme,
            },
            $unset: {
              'chatPreferences.sidebarTheme': '',
              'chatPreferences.customTheme': '',
            },
          }
        );

        migrated++;
        console.log(`✅ Migrated user ${user._id} (${user.email || 'no-email'}) - mode: ${mode}`);
      } catch (error) {
        skipped++;
        console.error(`❌ Failed to migrate user ${user._id}:`, error.message);
      }
    }

    console.log('\n📈 Migration Summary:');
    console.log(`   Total users found: ${users.length}`);
    console.log(`   Successfully migrated: ${migrated}`);
    console.log(`   Skipped (errors): ${skipped}`);
    console.log('\n✅ Migration complete!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

migrate();
