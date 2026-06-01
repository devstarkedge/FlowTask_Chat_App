import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { useThemeStore } from '../stores/themeStore';
import { 
  Bell,
  MessageSquare,
  Heart,
  AtSign,
  Hash,
} from 'lucide-react-native';

const ActivityScreen = ({ navigation }) => {
  const { colors } = useThemeStore();
  const [activities, setActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all'); // all, mentions, reactions, threads

  useEffect(() => {
    fetchActivities();
  }, []);

  const fetchActivities = async () => {
    setIsLoading(true);
    // TODO: Implement API call to fetch activities
    // This would connect to the notifications endpoint
    setIsLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchActivities();
    setRefreshing(false);
  };

  const renderActivityItem = ({ item }) => {
    const getIcon = () => {
      switch (item.type) {
        case 'mention':
          return <AtSign size={16} color={colors.primary} />;
        case 'reaction':
          return <Heart size={16} color={colors.error} />;
        case 'thread_reply':
          return <MessageSquare size={16} color={colors.success} />;
        default:
          return <Bell size={16} color={colors.textSecondary} />;
      }
    };

    return (
      <TouchableOpacity
        style={[styles.activityItem, { backgroundColor: colors.card }]}
        onPress={() => {
          // Navigate to the relevant message/channel
        }}
        activeOpacity={0.7}
      >
        <View style={styles.activityIconContainer}>
          {getIcon()}
        </View>
        <View style={styles.activityInfo}>
          <Text style={[styles.activityText, { color: colors.textPrimary }]} numberOfLines={2}>
            {item.text}
          </Text>
          <Text style={[styles.activityTime, { color: colors.textTertiary }]}>
            {formatDate(item.createdAt)}
          </Text>
        </View>
        {!item.read && (
          <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
        )}
      </TouchableOpacity>
    );
  };

  const styles = createStyles(colors);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.effectiveTheme === 'dark' ? 'light-content' : 'dark-content'} />
      
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Activity</Text>
      </View>

      {/* Filter Tabs */}
      <View style={[styles.filterContainer, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[
            styles.filterTab,
            filter === 'all' && { borderBottomColor: colors.primary }
          ]}
          onPress={() => setFilter('all')}
        >
          <Text 
            style={[
              styles.filterText,
              { color: filter === 'all' ? colors.primary : colors.textSecondary }
            ]}
          >
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterTab,
            filter === 'mentions' && { borderBottomColor: colors.primary }
          ]}
          onPress={() => setFilter('mentions')}
        >
          <Text 
            style={[
              styles.filterText,
              { color: filter === 'mentions' ? colors.primary : colors.textSecondary }
            ]}
          >
            Mentions
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterTab,
            filter === 'reactions' && { borderBottomColor: colors.primary }
          ]}
          onPress={() => setFilter('reactions')}
        >
          <Text 
            style={[
              styles.filterText,
              { color: filter === 'reactions' ? colors.primary : colors.textSecondary }
            ]}
          >
            Reactions
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterTab,
            filter === 'threads' && { borderBottomColor: colors.primary }
          ]}
          onPress={() => setFilter('threads')}
        >
          <Text 
            style={[
              styles.filterText,
              { color: filter === 'threads' ? colors.primary : colors.textSecondary }
            ]}
          >
            Threads
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : activities.length === 0 ? (
        <View style={styles.centerContainer}>
          <Bell size={48} color={colors.textTertiary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No activity yet
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.textTertiary }]}>
            Mentions, reactions, and thread replies will appear here
          </Text>
        </View>
      ) : (
        <FlatList
          data={activities}
          renderItem={renderActivityItem}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh} 
              tintColor={colors.primary} 
            />
          }
        />
      )}
    </SafeAreaView>
  );
};

const formatDate = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  filterTab: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
    gap: 8,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  activityIconContainer: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityInfo: {
    flex: 1,
  },
  activityText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  activityTime: {
    fontSize: 12,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
});

export default ActivityScreen;
