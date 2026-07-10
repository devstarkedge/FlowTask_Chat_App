import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/chat-app', { useNewUrlParser: true, useUnifiedTopology: true }).catch(err => {
    return mongoose.connect('mongodb://127.0.0.1:27017/flowtask_chat_app_dev');
  }).catch(() => null);

  if (mongoose.connection.readyState !== 1) {
    console.log("Could not connect to mongodb");
    process.exit(0);
  }
  
  const Channel = mongoose.model('Channel', new mongoose.Schema({}, { strict: false, collection: 'channels' }));
  const Message = mongoose.model('Message', new mongoose.Schema({}, { strict: false, collection: 'messages' }));
  
  const channels = await Channel.find({ lastMessagePreview: { $ne: '' } }).lean();
  let fixed = 0;
  for (const ch of channels) {
    const latestMsg = await Message.findOne({ channelId: ch._id, isDeleted: false }).sort({ createdAt: -1 });
    
    if (!latestMsg) {
      await Channel.updateOne({ _id: ch._id }, { $set: { lastMessagePreview: '', lastMessageAt: null } });
      fixed++;
      console.log('Cleared preview for channel:', ch.name);
    }
  }
  
  console.log('Fixed', fixed, 'channels');
  process.exit(0);
}
run();
