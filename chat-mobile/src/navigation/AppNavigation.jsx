import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "../stores/authStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useThemeStore } from "../stores/themeStore";
import { useNotificationStore } from "../stores/notificationStore";
import { useTranslation } from "../utils/i18n";
import {
  Hash,
  MessageSquare,
  Bell,
  Home,
  Search,
  MoreHorizontal,
} from "lucide-react-native";
import DrawerNavigation from "../components/DrawerNavigation";
import WorkspaceSwitcher from "../components/WorkspaceSwitcher";

// Unauth Screens
import LandingScreen from "../screens/Authentication/LandingScreen";
import EditContactScreen from "../screens/Authentication/EditContactScreen";
import EditProfileScreen from "../screens/Authentication/EditProfileScreen";
import LoginScreen from "../screens/Authentication/LoginScreen";
import RegisterScreen from "../screens/Authentication/RegisterScreen";

// Auth Screens
import WorkspaceSelectorScreen from "../screens/WorkspaceSelectorScreen";
import HomeScreen from "../screens/HomeScreen";
import DMListScreen from "../screens/DMListScreen";
import ActivityScreen from "../screens/Activity/ActivityScreen";
import YouScreen from "../screens/YouScreen";
import ProfileScreen from "../screens/Authentication/ProfileScreen";
import UserProfileScreen from "../screens/UserProfileScreen";
import ChatScreen from "../screens/Chat/ChatScreen";
import ChannelDetailsScreen from "../screens/ChannelDetailsScreen";
import CreateWorkspaceScreen from "../screens/Add-Workspace/CreateWorkspaceScreen";
import ThreadsScreen from "../screens/ThreadsScreen";
import ThreadDetailScreen from "../screens/ThreadDetailScreen";
import LaterScreen from "../screens/LaterScreen";
import DraftsScreen from "../screens/DraftsScreen";
import ScheduledScreen from "../screens/ScheduledScreen";
import NotificationsScreen from "../screens/NotificationsScreen";
import PreferencesScreen from "../screens/PreferencesScreen";
import ColorModeScreen from "../screens/Preferences/ColorModeScreen";
import NotificationsPreferencesScreen from "../screens/Preferences/NotificationsPreferencesScreen";
import EmojiSkinToneScreen from "../screens/Preferences/EmojiSkinToneScreen";
import SwipeActionsScreen from "../screens/Preferences/SwipeActionsScreen";
import HuddlesScreen from "../screens/Preferences/HuddlesScreen";
import LanguageScreen from "../screens/Preferences/LanguageScreen";
import TimeScreen from "../screens/Preferences/TimeScreen";
import AccentColorScreen from "../screens/Preferences/AccentColorScreen";
import FilesScreen from "../screens/FilesScreen";
import SearchScreen from "../screens/SearchScreen";
import PinnedMessagesScreen from "../screens/PinnedMessagesScreen";
import PeopleScreen from "../screens/PeopleScreen";
import InviteManagementScreen from "../screens/InviteManagementScreen";
import NewMessageScreen from "../screens/NewMessageScreen";
import CanvasListScreen from "../screens/Canvas/CanvasListScreen";
import CanvasEditorScreen from "../screens/Canvas/CanvasEditorScreen";
import WorkspaceSettingsScreen from "../screens/workspace/WorkspaceSettingsScreen";
import StarredMessagesScreen from "../screens/StarredMessagesScreen";
import { scale, verticalScale, moderateScale } from '../utils/responsive';



const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// ─── Badge Component ────────────────────────────────────────────────────────

const TabBadge = ({ count, color }) => {
  const { colors } = useThemeStore();
  if (!count || count <= 0) return null;
  return (
    <View style={[badgeStyles.badge, { backgroundColor: color }]}>
      <Text style={[badgeStyles.text, { color: colors.textOnPrimary }]}>{count > 99 ? "99+" : count}</Text>
    </View>
  );
};

const badgeStyles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: -2,
    right: -10,
    minWidth: scale(16),
    height: verticalScale(16),
    borderRadius: moderateScale(8),
    paddingHorizontal: scale(4),
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    fontSize: moderateScale(9),
    fontWeight: "700",
  },
});

// ─── Workspace Switcher Screen Wrapper ──────────────────────────────────────

function WorkspaceSwitcherScreen({ navigation }) {
  const [visible, setVisible] = React.useState(true);
  return (
    <WorkspaceSwitcher
      visible={visible}
      onClose={() => navigation.goBack()}
      navigation={navigation}
    />
  );
}

// ─── Bottom Tabs ────────────────────────────────────────────────────────────

function BottomTabs({ navigation }) {
  const { colors } = useThemeStore();
  const insets = useSafeAreaInsets();
  const unreadCount = useNotificationStore((s) => s.unreadCount) || 0;
  const { t } = useTranslation();

  return (
    <>
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarStyle: {
            backgroundColor: colors.backgroundSecondary,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
            paddingBottom: insets.bottom > 0 ? insets.bottom : verticalScale(6),
            paddingTop: verticalScale(4),
            height: 50 + (insets.bottom > 0 ? insets.bottom : 6),
          },
          tabBarLabelStyle: {
            fontSize: moderateScale(10),
            fontWeight: "600",
            marginTop: verticalScale(1),
          },
          tabBarIconStyle: {
            marginTop: verticalScale(2),
          },
          headerShown: false,
        }}
      >
        <Tab.Screen
          name="HomeTab"
          component={HomeScreen}
          options={{
            tabBarLabel: t("Home"),
            tabBarIcon: ({ color }) => (
              <Home size={22} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="DMsTab"
          component={DMListScreen}
          options={{
            tabBarLabel: t("DMs"),
            tabBarIcon: ({ color }) => (
              <MessageSquare size={22} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="ActivityTab"
          component={ActivityScreen}
          options={{
            tabBarLabel: t("Activity"),
            tabBarIcon: ({ color }) => (
              <View>
                <Bell size={22} color={color} />
                <TabBadge count={unreadCount} color={colors.primary} />
              </View>
            ),
          }}
        />
        <Tab.Screen
          name="MoreTab"
          component={YouScreen}
          options={{
            tabBarLabel: t("More"),
            tabBarIcon: ({ color }) => (
              <MoreHorizontal size={22} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="SearchTab"
          component={SearchScreen}
          options={{
            tabBarLabel: "",
            tabBarIcon: ({ focused }) => (
              <View
                style={{
                  width: scale(32),
                  height: verticalScale(32),
                  borderRadius: moderateScale(16),
                  backgroundColor: focused ? colors.primary : colors.backgroundTertiary,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Search size={18} color={focused ? colors.textInverse : colors.textPrimary} />
              </View>
            ),
          }}
        />
      </Tab.Navigator>
      <DrawerNavigation navigation={navigation} />
    </>
  );
}

// ─── Main Navigation ────────────────────────────────────────────────────────

export default function AppNavigation() {
  const { accessToken, isInitialized } = useAuthStore();
  const { activeWorkspaceId } = useWorkspaceStore();
  const { colors, isInitialized: themeInitialized } = useThemeStore();

  if (!isInitialized || !themeInitialized) return null;

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        headerStyle: {
          backgroundColor: colors.background,
        },
        headerTintColor: colors.textPrimary,
        contentStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      {!accessToken ? (
        <>
          <Stack.Screen name="Landing" component={LandingScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
        </>
      ) : !activeWorkspaceId ? (
        <>
          <Stack.Screen
            name="WorkspaceSelector"
            component={WorkspaceSelectorScreen}
          />
          <Stack.Screen
            name="CreateWorkspace"
            component={CreateWorkspaceScreen}
          />
        </>
      ) : (
        <>
          <Stack.Screen name="Main" component={BottomTabs} />
          <Stack.Screen
            name="WorkspaceSwitcher"
            component={WorkspaceSwitcherScreen}
            options={{
              headerShown: false,
              animation: "fade",
              presentation: "transparentModal",
            }}
          />
          <Stack.Screen
            name="CreateWorkspace"
            component={CreateWorkspaceScreen}
          />
          <Stack.Screen
            name="Chat"
            component={ChatScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ChannelDetails"
            component={ChannelDetailsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="InviteManagement"
            component={InviteManagementScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Threads"
            component={ThreadsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ThreadDetail"
            component={ThreadDetailScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Later"
            component={LaterScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Drafts"
            component={DraftsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Scheduled"
            component={ScheduledScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Notifications"
            component={NotificationsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Preferences"
            component={PreferencesScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ColorMode"
            component={ColorModeScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="NotificationsPreferences"
            component={NotificationsPreferencesScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="EmojiSkinTone"
            component={EmojiSkinToneScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="SwipeActions"
            component={SwipeActionsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Huddles"
            component={HuddlesScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Language"
            component={LanguageScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Time"
            component={TimeScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AccentColor"
            component={AccentColorScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Profile"
            component={ProfileScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="EditContact"
            component={EditContactScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="EditProfile"
            component={EditProfileScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="UserProfile"
            component={UserProfileScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Files"
            component={FilesScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Search"
            component={SearchScreen}
            options={{ headerShown: true, title: "Search" }}
          />
          <Stack.Screen
            name="PinnedMessages"
            component={PinnedMessagesScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="People"
            component={PeopleScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="NewMessage"
            component={NewMessageScreen}
            options={{ 
              headerShown: false,
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="CanvasList"
            component={CanvasListScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="CanvasEditor"
            component={CanvasEditorScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="StarredMessages"
            component={StarredMessagesScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="WorkspaceSettings"
            component={WorkspaceSettingsScreen}
            options={{ headerShown: false }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
