import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Dimensions,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useThemeStore } from "../../stores/themeStore";
import { useAuthStore } from "../../stores/authStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import {
  Mail,
  Briefcase,
  ChevronLeft,
  MoreHorizontal,
  Settings,
  Bell,
  Palette,
  LogOut,
  Clock,
} from "lucide-react-native";
import { AppAvatar } from "../../components/common";
import { formatMessageTime } from '../../utils/dateUtils';

const { width } = Dimensions.get("window");

const ProfileScreen = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { user } = useAuthStore();
  const { activeWorkspace } = useWorkspaceStore();
  const insets = useSafeAreaInsets();
  const logout = useAuthStore((s) => s.logout);

  const styles = createStyles(colors);

  const imageSize = width - 32;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top"]}
    >
      <StatusBar
        barStyle={
          colors.effectiveTheme === "dark" ? "light-content" : "dark-content"
        }
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: 12 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[
            styles.headerButton,
            { backgroundColor: colors.backgroundSecondary },
          ]}
        >
          <ChevronLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.titleContainer}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            Profile
          </Text>
        </View>

        {/* Placeholder to balance the back button */}
        <View style={styles.headerButton} />
      </View> 
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Profile Image */}
        <View style={styles.imageContainer}>
          <AppAvatar user={user} size={imageSize} showStatus={false} />
        </View>

        {/* User Info */}
        <View style={styles.infoSection}>
          <Text style={[styles.name, { color: colors.textPrimary }]}>
            {user?.name}
          </Text>

          <View style={styles.statusRow}>
            <View
              style={[styles.statusDot, { backgroundColor: colors.online }]}
            />
            <Text style={[styles.statusText, { color: colors.textPrimary }]}>
              Active
            </Text>
          </View>

          <View style={styles.timeRow}>
            <Clock size={20} color={colors.textPrimary} />
            <Text style={[styles.timeText, { color: colors.textPrimary }]}>
              {formatMessageTime(new Date())} local time
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              { backgroundColor: colors.backgroundSecondary },
            ]}
            activeOpacity={0.7}
          >
            <Text
              style={[styles.actionButtonText, { color: colors.textPrimary }]}
            >
              Set a Status
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.actionButton,
              { backgroundColor: colors.backgroundSecondary },
            ]}
            activeOpacity={0.7}
          >
            <Text
              style={[styles.actionButtonText, { color: colors.textPrimary }]}
            >
              Edit Profile
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Contact Information */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              Contact Information
            </Text>
            <TouchableOpacity>
              <Text style={[styles.editText, { color: colors.primary }]}>
                Edit
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.contactRow}>
            <View style={styles.contactIconContainer}>
              <Mail size={24} color={colors.textPrimary} />
            </View>
            <View style={styles.contactDetails}>
              <Text
                style={[styles.contactEmail, { color: colors.textPrimary }]}
              >
                {user?.email}
              </Text>
              <Text
                style={[styles.contactLabel, { color: colors.textSecondary }]}
              >
                Work
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Additional Settings / Links */}
        {/* <View style={styles.section}>
          <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
            <LinkRow icon={Palette} label="Preferences" colors={colors} onPress={() => navigation.navigate('Preferences')} />
            <LinkRow icon={Bell} label="Notifications" colors={colors} onPress={() => navigation.navigate('Notifications')} />
          </View>
        </View> */}

        {/* Logout */}
        {/* <View style={styles.section}>
          <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
            <TouchableOpacity style={styles.logoutRow} onPress={logout} activeOpacity={0.7}>
              <LogOut size={20} color={colors.error} />
              <Text style={[styles.logoutLabel, { color: colors.error }]}>Log Out</Text>
            </TouchableOpacity>
          </View>
        </View> */}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const LinkRow = ({ icon: Icon, label, colors, onPress }) => (
  <TouchableOpacity
    style={prStyles.linkRow}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <Icon size={20} color={colors.textSecondary} />
    <Text style={[prStyles.linkLabel, { color: colors.textPrimary, flex: 1 }]}>
      {label}
    </Text>
  </TouchableOpacity>
);

const prStyles = StyleSheet.create({
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  linkLabel: { fontSize: 15, fontWeight: "500" },
});

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    headerButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: "center",
      alignItems: "center",
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: "700",
    },
    scrollContent: {
      paddingTop: 8,
    },
    imageContainer: {
      alignItems: "center",
      marginHorizontal: 16,
      marginBottom: 20,
      borderRadius: 24,
      overflow: "hidden", // Add overflow hidden if we customize the image corner inside
    },
    infoSection: {
      paddingHorizontal: 16,
      marginBottom: 20,
    },
    name: {
      fontSize: 26,
      fontWeight: "800",
      marginBottom: 16,
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
    },
    statusDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    statusText: {
      fontSize: 16,
    },
    timeRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    timeText: {
      fontSize: 16,
    },
    actionButtons: {
      flexDirection: "row",
      paddingHorizontal: 16,
      gap: 12,
      marginBottom: 24,
    },
    actionButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 16,
      justifyContent: "center",
      alignItems: "center",
    },
    actionButtonText: {
      fontSize: 16,
      fontWeight: "600",
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      width: "100%",
      marginBottom: 24,
    },
    section: {
      paddingHorizontal: 16,
      marginBottom: 24,
    },
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "600",
    },
    editText: {
      fontSize: 16,
      fontWeight: "600",
    },
    contactRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
    },
    contactIconContainer: {
      width: 24,
      alignItems: "center",
    },
    contactDetails: {
      flex: 1,
      gap: 4,
    },
    contactEmail: {
      fontSize: 16,
    },
    contactLabel: {
      fontSize: 14,
    },
    card: {
      borderRadius: 12,
      padding: 16,
      gap: 8,
    },
    logoutRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 4,
    },
    logoutLabel: {
      fontSize: 16,
      fontWeight: "600",
    },
  });

export default ProfileScreen;
