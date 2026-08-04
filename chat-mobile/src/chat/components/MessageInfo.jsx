import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { X } from 'lucide-react-native';
import useReceipts from '../hooks/useReceipts';
import ReceiptList from './ReceiptList';

export const MessageInfo = ({ visible, onClose, channelId, messageId }) => {
  const { deliveredTo, readBy, loading } = useReceipts(channelId, messageId);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.backdrop}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Message Info</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={20} color="#1a1d21" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator style={styles.loader} size="large" color="#007aff" />
          ) : (
            <View style={styles.body}>
              <ReceiptList title="Read By" data={readBy} timeKey="readAt" />
              <ReceiptList title="Delivered To" data={deliveredTo} timeKey="deliveredAt" />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f2',
    paddingBottom: 12,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1d21',
  },
  loader: {
    marginVertical: 40,
  },
  body: {
    paddingBottom: 24,
  },
});

export default MessageInfo;
