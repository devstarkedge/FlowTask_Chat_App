import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useThemeStore } from '../stores/themeStore';
import { Hash, Users, Pin, Bell, Settings } from 'lucide-react-native';

const ChannelDetailsScreen = ({ route }) => {
  const { channelName, memberCount = 0 } = route.params || {};
  const { colors } = useThemeStore();

  const DetailItem = ({ icon: Icon, label, onPress }) => (
    <TouchableOpacity style={styles.detailItem} onPress={onPress}>
      <Icon size={20} color={colors.textSecondary} />
      <Text style={[styles.detailLabel, { color: colors.textPrimary }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={[styles.channelIcon, { backgroundColor: colors.primaryLight }]}>
            <Hash size={32} color={colors.primary} />
          </View>
          <Text style={[styles.channelName, { color: colors.textPrimary }]}>{channelName}</Text>
          <Text style={[styles.memberCount, { color: colors.textSecondary }]}>{memberCount} members</Text>
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
  },
  header: {
    alignItems: 'center',
    paddingVertical: 32,
    borderBottomWidth: 1,
  },
  channelIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  channelName: {
    fontSize: 24,
    fontWeight: '700',
  },
  memberCount: {
    fontSize: 14,
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
    fontWeight: '500',
  },
});

export default ChannelDetailsScreen;
