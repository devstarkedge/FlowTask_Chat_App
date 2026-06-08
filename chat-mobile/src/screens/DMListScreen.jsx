import React, { useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TextInput,
  TouchableOpacity,
  StatusBar,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useChannelStore } from "../stores/channelStore";
import { useAuthStore } from "../stores/authStore";
import { useThemeStore } from "../stores/themeStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import DMListItem from "../components/DMListItem";
import WorkspaceAvatar from "../components/WorkspaceAvatar";
import Avatar from "../components/Avatar";
import { MessageSquare, Search } from "lucide-react-native";

const DMListScreen = ({ navigation }) => {
  const { channels, setActiveChannel } = useChannelStore();
  const { user } = useAuthStore();
  const { colors, effectiveTheme } = useThemeStore();
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const unreads = useChannelStore((state) => state.unreads) || {};
  const dmChannels = useMemo(
    () => channels.filter((ch) => ch.type === "dm"),
    [channels],
  );

  const handleDMPress = useCallback(
    (channel) => {
      setActiveChannel(channel._id);
      navigation.navigate("Chat", {
        channelId: channel._id,
        channelName: channel.name,
      });
    },
    [navigation, setActiveChannel],
  );

  const renderDM = useCallback(
    ({ item }) => (
      <DMListItem
        channel={item}
        onPress={handleDMPress}
        unreadCount={unreads[item._id] || 0}
      />
    ),
    [handleDMPress, unreads],
  );

  const keyExtractor = useCallback((item) => item._id, []);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <StatusBar
        barStyle={effectiveTheme === "dark" ? "light-content" : "dark-content"}
      />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          DM's List
        </Text>
      </View>

      {/* Search Bar */}
      <View
        style={[styles.searchBar, { backgroundColor: colors.inputBackground }]}
      >
        <Search size={18} color={colors.inputPlaceholder} />
        <TextInput
          style={[styles.searchInput, { color: colors.inputText }]}
          placeholder="Search people..."
          placeholderTextColor={colors.inputPlaceholder}
        />
      </View>

      <FlatList
        data={dmChannels}
        renderItem={renderDM}
        keyExtractor={keyExtractor}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MessageSquare size={48} color={colors.border} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No direct messages yet
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  headerGradient: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    boxShadow: "0px 4px 10px rgba(0, 0, 0, 0.2)",
    elevation: 8,
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  workspaceInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  workspaceName: {
    fontSize: 16,
    fontWeight: "700",
    color: "white",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 15,
    marginTop: 12,
  },
});

export default DMListScreen;
