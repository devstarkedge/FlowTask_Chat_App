import mongoose from 'mongoose';

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/chat-app', { useNewUrlParser: true, useUnifiedTopology: true }).catch(err => {
    return mongoose.connect('mongodb://127.0.0.1:27017/flowtask_chat_app_dev');
  }).catch(() => null);

  if (mongoose.connection.readyState !== 1) {
    console.log("Could not connect to mongodb");
    process.exit(0);
  }
  
  const Channel = mongoose.model('Channel', new mongoose.Schema({}, { strict: false, collection: 'channels' }));
  const Message = mongoose.model('Message', new mongoose.Schema({}, { strict: false, collection: 'messages' }));
  
  const channels = await Channel.find({ type: 'dm', lastMessagePreview: { $ne: '' } }).lean();
  
  for (const ch of channels) {
    const latestMsg = await Message.findOne({ channelId: ch._id, isDeleted: false }).sort({ createdAt: -1 });
    
    if (!latestMsg) {
      console.log('Channel', ch.name, 'has preview', ch.lastMessagePreview, 'but NO messages!');
    } else {
      console.log('Channel', ch.name, 'is fine.');
    }
  }
  
  console.log('Done checking ' + channels.length + ' DM channels.');
  process.exit(0);
}
run();
