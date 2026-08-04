import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Check, CheckCheck, Clock, AlertCircle } from 'lucide-react-native';
import useMessageStatus from '../hooks/useMessageStatus';

export const MessageStatus = ({ messageId }) => {
  const { status } = useMessageStatus(messageId);

  if (status === 'pending' || status === 'sending') {
    return (
      <View style={styles.container}>
        <Clock size={12} color="#8a8f9d" />
      </View>
    );
  }

  if (status === 'failed') {
    return (
      <View style={styles.container}>
        <AlertCircle size={12} color="#ff3b30" />
      </View>
    );
  }

  if (status === 'sent') {
    return (
      <View style={styles.container}>
        <Check size={12} color="#8a8f9d" />
      </View>
    );
  }

  if (status === 'delivered') {
    return (
      <View style={styles.container}>
        <CheckCheck size={12} color="#8a8f9d" />
      </View>
    );
  }

  if (status === 'seen') {
    return (
      <View style={styles.container}>
        <CheckCheck size={12} color="#34c759" />
      </View>
    );
  }

  return null;
};

const styles = StyleSheet.create({
  container: {
    marginLeft: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default MessageStatus;
