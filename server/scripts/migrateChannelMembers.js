import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Migration: Extract Channel Members to ChannelMember collection
 *
 * Reads the embedded `members[]` array from every Channel document and
 * inserts corresponding ChannelMember documents. Uses bulkWrite with
 * upsert to be safe for re-runs (idempotent).
 *
 * Also migrates Message.reactions[] to the MessageReaction collection.
 *
 * Usage: node scripts/migrateChannelMembers.js
 */

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('[FATAL] MONGO_URI required');
  process.exit(1);
}

const BATCH_SIZE = 500;

async function migrateMembers(db) {
  console.log('\n=== Migrating Channel Members ===');
  const channelsColl = db.collection('channels');
  const membersColl = db.collection('channelmembers');

  const cursor = channelsColl.find(
    { 'members.0': { $exists: true } },
    { projection: { _id: 1, workspaceId: 1, members: 1 } },
  );

  let totalChannels = 0;
  let totalMembers = 0;
  let batch = [];

  try {
    while (await cursor.hasNext()) {
      const channel = await cursor.next();
      totalChannels++;

      for (const member of channel.members) {
        if (!member.userId) continue;

        batch.push({
          updateOne: {
            filter: { channelId: channel._id, userId: member.userId },
            update: {
              $setOnInsert: {
                channelId: channel._id,
                userId: member.userId,
                workspaceId: channel.workspaceId,
                role: member.role || 'member',
                joinedAt: member.joinedAt || new Date(),
                notificationsEnabled: member.notificationsEnabled !== false,
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            },
            upsert: true,
          },
        });

        if (batch.length >= BATCH_SIZE) {
          const result = await membersColl.bulkWrite(batch, { ordered: false });
          totalMembers += result.upsertedCount;
          batch = [];
        }
      }
    }
  } finally {
    await cursor.close();
  }

  if (batch.length > 0) {
    const result = await membersColl.bulkWrite(batch, { ordered: false });
    totalMembers += result.upsertedCount;
  }

  // Create indexes
  await membersColl.createIndex({ channelId: 1, userId: 1 }, { unique: true });
  await membersColl.createIndex({ userId: 1, workspaceId: 1, isActive: 1 });
  await membersColl.createIndex({ channelId: 1, isActive: 1, role: 1 });

  console.log(`Processed ${totalChannels} channels, inserted ${totalMembers} channel members`);
}

async function migrateReactions(db) {
  console.log('\n=== Migrating Message Reactions ===');
  const messagesColl = db.collection('messages');
  const reactionsColl = db.collection('messagereactions');

  const cursor = messagesColl.find(
    { 'reactions.0': { $exists: true } },
    { projection: { _id: 1, channelId: 1, workspaceId: 1, reactions: 1 } },
  );

  let totalMessages = 0;
  let totalReactions = 0;
  let batch = [];

  try {
    while (await cursor.hasNext()) {
      const message = await cursor.next();
      totalMessages++;

      for (const reaction of message.reactions) {
        if (!reaction.emoji || !reaction.userIds?.length) continue;

        for (const userId of reaction.userIds) {
          batch.push({
            updateOne: {
              filter: { messageId: message._id, emoji: reaction.emoji, userId },
              update: {
                $setOnInsert: {
                  messageId: message._id,
                  channelId: message.channelId,
                  workspaceId: message.workspaceId,
                  emoji: reaction.emoji,
                  userId,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              },
              upsert: true,
            },
          });

          if (batch.length >= BATCH_SIZE) {
            const result = await reactionsColl.bulkWrite(batch, { ordered: false });
            totalReactions += result.upsertedCount;
            batch = [];
          }
        }
      }
    }
  } finally {
    await cursor.close();
  }

  if (batch.length > 0) {
    const result = await reactionsColl.bulkWrite(batch, { ordered: false });
    totalReactions += result.upsertedCount;
  }

  // Create indexes
  await reactionsColl.createIndex({ messageId: 1, emoji: 1, userId: 1 }, { unique: true });
  await reactionsColl.createIndex({ messageId: 1 });

  console.log(`Processed ${totalMessages} messages, inserted ${totalReactions} reactions`);
}

async function migrate() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  await migrateMembers(db);
  await migrateReactions(db);

  console.log('\nMigration complete!');
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
