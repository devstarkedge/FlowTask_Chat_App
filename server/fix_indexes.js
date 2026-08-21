import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/flowtask-chat');
  console.log('Connected to MongoDB');
  
  try {
    await mongoose.connection.collection('savedmessages').dropIndex('userId_1_messageId_1_attachmentId_1');
    console.log('Successfully dropped old index');
  } catch (err) {
    console.error('Error dropping index (may not exist):', err.message);
  }

  // Rebuild indexes based on the model
  const SavedMessage = (await import('./modules/messages/SavedMessage.model.js')).default;
  await SavedMessage.syncIndexes();
  console.log('Successfully synced new indexes');

  process.exit(0);
}

run();
