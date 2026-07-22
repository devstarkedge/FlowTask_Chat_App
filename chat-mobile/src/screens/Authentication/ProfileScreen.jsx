import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeStore } from "../../stores/themeStore";
import { useAuthStore } from "../../stores/authStore";
import { Mail, ChevronLeft, Clock, LogOut } from "lucide-react-native";
import { AppAvatar } from "../../components/common";
import { formatMessageTime } from "../../utils/dateUtils";
import { scale, verticalScale, moderateScale } from "../../utils/responsive";
import StatusModal from "../../components/StatusModal";

const { width } = Dimensions.get("window");

const ProfileScreen = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { user, logout } = useAuthStore();
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const styles = createStyles(colors);
  const imageSize = width - 32;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
      <StatusBar barStyle={colors.effectiveTheme === "dark" ? "light-content" : "dark-content"} />
      {/* Header */}
      <View style={[styles.header, { paddingTop: verticalScale(12) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.headerButton, { backgroundColor: colors.backgroundSecondary }]}>
          <ChevronLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.titleContainer}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Profile</Text>
        </View>
        <View style={styles.headerButton} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.imageContainer}>
          <AppAvatar user={user} size={imageSize} showStatus={false} />
        </View>
        <View style={styles.infoSection}>
          <Text style={[styles.name, { color: colors.textPrimary }]}>{user?.name}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: colors.online }]} />
            <Text style={[styles.statusText, { color: colors.textPrimary }]}>Active</Text>
          </View>
          <View style={styles.timeRow}>
            <Clock size={20} color={colors.textPrimary} />
            <Text style={[styles.timeText, { color: colors.textPrimary }]}>{formatMessageTime(new Date())} local time</Text>
          </View>
        </View>
        <View style={styles.actionButtons}>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.backgroundSecondary }]} activeOpacity={0.7} onPress={() => setStatusModalVisible(true)}>
            <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Set a Status</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.backgroundSecondary }]} activeOpacity={0.7} onPress={() => navigation.navigate('EditProfile')}>
            <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Edit Profile</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Contact Information</Text>
            <TouchableOpacity onPress={() => navigation.navigate('EditContact')}>
              <Text style={[styles.editText, { color: colors.primary }]}>Edit</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.contactRow}>
            <View style={styles.contactIconContainer}>
              <Mail size={24} color={colors.textPrimary} />
            </View>
            <View style={styles.contactDetails}>
              <Text style={[styles.contactEmail, { color: colors.textPrimary }]}>{user?.email}</Text>
              <Text style={[styles.contactLabel, { color: colors.textSecondary }]}>Work</Text>
            </View>
          </View>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        {/* Optional Logout */}
        {/* <View style={styles.section}>
          <View style={[styles.card, { backgroundColor: colors.backgroundSecondary }]}>
            <TouchableOpacity style={styles.logoutRow} onPress={logout} activeOpacity={0.7}>
              <LogOut size={20} color={colors.error} />
              <Text style={[styles.logoutLabel, { color: colors.error }]}>Log Out</Text>
            </TouchableOpacity>
          </View>
        </View> */}
        <View style={{ height: verticalScale(40) }} />
        <StatusModal visible={statusModalVisible} onClose={() => setStatusModalVisible(false)} />
      </ScrollView>
    </SafeAreaView>
  );
};

const LinkRow = ({ icon: Icon, label, colors, onPress }) => (
  <TouchableOpacity style={prStyles.linkRow} onPress={onPress} activeOpacity={0.7}>
    <Icon size={20} color={colors.textSecondary} />
    <Text style={[prStyles.linkLabel, { color: colors.textPrimary, flex: 1 }]}>{label}</Text>
  </TouchableOpacity>
);

const prStyles = StyleSheet.create({
  linkRow: { flexDirection: "row", alignItems: "center", paddingVertical: verticalScale(12), gap: 12 },
  linkLabel: { fontSize: moderateScale(15), fontWeight: "500" },
});

const createStyles = (colors) =>
  StyleSheet.create({
    container: { flex: 1 },
     
     
     
     
     

     
     
     
    
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: scale(16), paddingVertical: verticalScale(12) },
    headerButton: { width: scale(44), height: verticalScale(44), borderRadius: moderateScale(22), justifyContent: "center", alignItems: "center" },
    titleContainer: { flex: 1, alignItems: "center" },
    headerTitle: { fontSize: moderateScale(18), fontWeight: "700" },
    scrollContent: { paddingTop: verticalScale(8) },
    imageContainer: { alignItems: "center", marginHorizontal: scale(16), marginBottom: verticalScale(20), borderRadius: moderateScale(24), overflow: "hidden" },
    infoSection: { paddingHorizontal: scale(16), marginBottom: verticalScale(20) },
    name: { fontSize: moderateScale(26), fontWeight: "800", marginBottom: verticalScale(16) },
    statusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: verticalScale(8) },
    statusDot: { width: scale(10), height: verticalScale(10), borderRadius: moderateScale(5) },
    statusText: { fontSize: moderateScale(16) },
    timeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    timeText: { fontSize: moderateScale(16) },
    actionButtons: { flexDirection: "row", paddingHorizontal: scale(16), gap: 12, marginBottom: verticalScale(24) },
    actionButton: { flex: 1, paddingVertical: verticalScale(14), borderRadius: moderateScale(16), justifyContent: "center", alignItems: "center" },
    actionButtonText: { fontSize: moderateScale(16), fontWeight: "600" },
    divider: { height: StyleSheet.hairlineWidth, width: "100%", marginBottom: verticalScale(24) },
    section: { paddingHorizontal: scale(16), marginBottom: verticalScale(24) },
    sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: verticalScale(16) },
    sectionTitle: { fontSize: moderateScale(18), fontWeight: "600" },
    editText: { fontSize: moderateScale(16), fontWeight: "600" },
    contactRow: { flexDirection: "row", alignItems: "center", gap: 16 },
    contactIconContainer: { width: scale(24), alignItems: "center" },
    contactDetails: { flex: 1, gap: 4 },
    contactEmail: { fontSize: moderateScale(16) },
    contactLabel: { fontSize: moderateScale(14) },
    card: { borderRadius: moderateScale(12), padding: moderateScale(16), gap: 8 },
    logoutRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: verticalScale(4) },
    logoutLabel: { fontSize: moderateScale(16), fontWeight: "600" },
  });

export default ProfileScreen;
