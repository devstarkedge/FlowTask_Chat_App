/**
 * MessageStatusTicks
 * Props:
 *   message   – The message object (must have status, deliveredAt, seenAt fields)
 *   colors    – Theme colors
 *   isMe      – Whether this message was sent by the current user
 *   size      – Icon size (default: 12)
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Check, CheckCheck, Clock, AlertCircle } from 'lucide-react-native';
import { scale } from '../utils/responsive';

const MessageStatusTicks = React.memo(function MessageStatusTicks({
  message,
  colors,
  isMe,
  size = 12,
}) {
  // Never show ticks for messages not sent by the current user
  if (!isMe) return null;

  // Permanently failed after retries
  if (message.permanentlyFailed) {
    return (
      <View style={styles.container}>
        <AlertCircle size={size} color={colors.error} />
      </View>
    );
  }

  // Pending (queued offline)
  if (message.pending || message.status === 'pending') {
    return (
      <View style={styles.container}>
        <Clock size={size} color={colors.textTertiary} />
      </View>
    );
  }

  // Seen (double blue ticks) - message has been read
  if (message.seenAt || message.status === 'seen') {
    return (
      <View style={styles.container}>
        <CheckCheck size={size} color={colors.online || '#53BDEB'} />
      </View>
    );
  }

  // Delivered (double gray ticks) - message delivered to recipient
  if (message.deliveredAt || message.status === 'delivered') {
    return (
      <View style={styles.container}>
        <CheckCheck size={size} color={colors.textTertiary} />
      </View>
    );
  }

  // Sent (single tick) - message sent to server
  if (message.status === 'sent') {
    return (
      <View style={styles.container}>
        <Check size={size} color={colors.textTertiary} />
      </View>
    );
  }

  // Failed to send (network error)
  if (message.failed) {
    return (
      <View style={styles.container}>
        <AlertCircle size={size} color={colors.error} />
      </View>
    );
  }

  // Default: pending state
  return (
    <View style={styles.container}>
      <Clock size={size} color={colors.textTertiary} />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: scale(4),
  },
});

export default React.memo(MessageStatusTicks);