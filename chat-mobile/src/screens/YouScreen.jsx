import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../stores/authStore";
import { useThemeStore } from "../stores/themeStore";
import CreateNewBottomSheet from "../components/CreateNewBottomSheet";
import {
  Files,
  Users,
  Building2,
  Plus
} from "lucide-react-native";
import { scale, verticalScale, moderateScale } from '../utils/responsive';

const MoreItem = ({ icon: Icon, title, subtitle, showProBadge, onPress, colors }) => (
  <TouchableOpacity style={[styles.itemContainer, { borderBottomColor: colors.border }]} onPress={onPress} activeOpacity={0.7}>
    <View style={styles.iconContainer}>
      <Icon size={22} color={colors.textPrimary} strokeWidth={1.5} />
    </View>
    <View style={styles.textContainer}>
      <Text style={[styles.itemTitle, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.itemSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
    </View>
    {showProBadge && (
      <View style={styles.badgeContainer}>
        <Text style={styles.badgeText}>PRO</Text>
      </View>
    )}
  </TouchableOpacity>
);

const MoreScreen = ({ navigation }) => {
  const { colors, effectiveTheme } = useThemeStore();
  const currentUser = useAuthStore((s) => s.user);
  const [bottomSheetVisible, setBottomSheetVisible] = useState(false);

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>More</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <MoreItem
          icon={Files}
          title="Files"
          subtitle="Browse your canvases, lists and attachments"
          colors={colors}
          onPress={() => navigation.navigate("Files")}
        />
        <MoreItem
          icon={Users}
          title="Assigned to you"
          subtitle="Tick off your tasks"
          showProBadge={true}
          colors={colors}
          onPress={() => Alert.alert("Coming soon", "This feature will be available soon.")}
        />
        <MoreItem
          icon={Building2}
          title="External connections"
          subtitle="Work with people from other organisations"
          showProBadge={true}
          colors={colors}
          onPress={() => Alert.alert("Coming soon", "This feature will be available soon.")}
        />
      </ScrollView>

      {/* Floating "+" button for create new menu */}
      <TouchableOpacity 
        style={[
          styles.fab,
          {
            backgroundColor: colors.primary,
            shadowColor: colors.shadow || "#000",
          },
        ]} 
        activeOpacity={0.8}
        onPress={() => setBottomSheetVisible(true)}
      >
        <Plus size={24} color={colors.textOnPrimary} strokeWidth={2.5} />
      </TouchableOpacity>

      <CreateNewBottomSheet 
        visible={bottomSheetVisible} 
        onClose={() => setBottomSheetVisible(false)} 
        navigation={navigation} 
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1 
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    borderBottomWidth: 1,
  },
  title: {
    fontSize: moderateScale(22),
    fontWeight: "800",
    color: '#ffffff',
  },
  scrollContent: {
    paddingBottom: 100,
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: verticalScale(16),
    paddingHorizontal: scale(16),
    borderBottomWidth: 1,
  },
  iconContainer: {
    width: scale(32),
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginRight: scale(12),
  },
  textContainer: {
    flex: 1,
    paddingRight: scale(16),
    justifyContent: 'center',
  },
  itemTitle: {
    fontSize: moderateScale(16),
    fontWeight: '400',
  },
  itemSubtitle: {
    fontSize: moderateScale(13),
    marginTop: verticalScale(4),
  },
  badgeContainer: {
    backgroundColor: '#8B428B', // Purple PRO badge color
    paddingHorizontal: scale(6),
    paddingVertical: verticalScale(3),
    borderRadius: moderateScale(4),
  },
  badgeText: {
    color: '#ffffff',
    fontSize: moderateScale(10),
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: scale(52),
    height: scale(52),
    borderRadius: moderateScale(26),
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
    shadowOffset: { width: scale(0), height: scale(2) },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  }
});

export default MoreScreen;
