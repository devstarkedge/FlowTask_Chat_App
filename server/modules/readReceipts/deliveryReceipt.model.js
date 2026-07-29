import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const deliveryReceiptSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'ChatUser',
      required: true,
    },
    channelId: {
      type: Schema.Types.ObjectId,
      ref: 'Channel',
      required: true,
    },
    messageId: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      required: true,
      index: true,
    },
    deliveredAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

deliveryReceiptSchema.index({ workspaceId: 1, messageId: 1, userId: 1 }, { unique: true });

const DeliveryReceipt = mongoose.models.DeliveryReceipt || model('DeliveryReceipt', deliveryReceiptSchema);

export default DeliveryReceipt;
