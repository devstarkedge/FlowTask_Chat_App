import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Hash, Users, Pin, Bell, Settings } from 'lucide-react-native';

const ChannelDetailsScreen = ({ route }) => {
  const { channelName, memberCount = 0 } = route.params || {};

  const DetailItem = ({ icon: Icon, label, onPress }) => (
    <TouchableOpacity style={styles.detailItem} onPress={onPress}>
      <Icon size={20} color="#6b7280" />
      <Text style={styles.detailLabel}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <View style={styles.header}>
          <View style={styles.channelIcon}>
            <Hash size={32} color="#6366f1" />
          </View>
          <Text style={styles.channelName}>{channelName}</Text>
          <Text style={styles.memberCount}>{memberCount} members</Text>
        </View>

        <View style={styles.section}>
          <DetailItem icon={Users} label="View Members" />
          <DetailItem icon={Pin} label="Pinned Messages" />
          <DetailItem icon={Bell} label="Notification Settings" />
          <DetailItem icon={Settings} label="Channel Settings" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 32,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  channelIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  channelName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  memberCount: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  section: {
    paddingVertical: 12,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  detailLabel: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '500',
  },
});

export default ChannelDetailsScreen;
