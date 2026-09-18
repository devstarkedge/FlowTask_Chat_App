import mongoose from 'mongoose';
import env from '../config/environment.js';

// Production disables autoIndex. Add only the supporting profile-sync
// indexes; never drop indexes or alter documents. Repeated runs are safe.
try {
  await mongoose.connect(env.MONGO_URI, { autoIndex:false,serverSelectionTimeoutMS:10000 });
  const indexes = [
    ['messages',{ workspaceId:1,'activityMeta.targetUserId':1 }],
    ['messages',{ workspaceId:1,'activityMeta.targetFlowTaskUserId':1 }],
    ['messages',{ workspaceId:1,'activityMeta.actorId':1 }],
    ['messages',{ workspaceId:1,'activityMeta.actorFlowTaskUserId':1 }],
    ['messages',{ workspaceId:1,'replyTo.authorId':1 }],
    ['messages',{ workspaceId:1,'forwardMeta.originalSenderId':1 }],
    ['notifications',{ workspaceId:1,senderId:1 }],
  ];
  for (const [collection,key] of indexes) {
    console.log(await mongoose.connection.collection(collection).createIndex(key));
  }
} catch (error) {
  console.error('Profile-sync index creation failed:',error.message);
  process.exitCode=1;
} finally {
  await mongoose.disconnect();
}
