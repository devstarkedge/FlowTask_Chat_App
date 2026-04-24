#!/usr/bin/env node
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../../config/database.js';

async function run() {
  try {
    await connectDatabase();

    const db = mongoose.connection.db;
    const coll = db.collection('workspaces');

    console.log('Listing existing indexes on workspaces collection...');
    const indexes = await coll.indexes();
    console.log(JSON.stringify(indexes, null, 2));

    const existingSlug = indexes.find((ix) => ix.key && ix.key.slug === 1 && ix.unique);
    if (existingSlug) {
      console.log(`Dropping existing unique slug index: ${existingSlug.name}`);
      try {
        await coll.dropIndex(existingSlug.name);
      } catch (err) {
        console.error('Failed to drop existing slug index:', err.message || err);
        throw err;
      }
    } else {
      console.log('No unique slug index found to drop.');
    }

    console.log('Creating partial unique index on slug for active workspaces...');
    await coll.createIndex({ slug: 1 }, { unique: true, partialFilterExpression: { isActive: true } });
    console.log('Partial unique index created successfully.');

  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    try {
      await disconnectDatabase();
    } catch (e) {
      // ignore
    }
  }
}

run();
