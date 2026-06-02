import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useAuthStore } from "../stores/authStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useThemeStore } from "../stores/themeStore";
import {
  Hash,
  MessageSquare,
  Bell,
  MoreHorizontal,
  Home,
  Search,
} from "lucide-react-native";
import DrawerNavigation from "../components/DrawerNavigation";

// Unauth Screens
import LandingScreen from "../screens/LandingScreen";
import LoginScreen from "../screens/LoginScreen";
import RegisterScreen from "../screens/RegisterScreen";

// Auth Screens
import WorkspaceSelectorScreen from "../screens/WorkspaceSelectorScreen";
import HomeScreenEnhanced from "../screens/HomeScreen";
const HomeScreen = HomeScreenEnhanced;
import ChannelListScreen from "../screens/ChannelListScreen";
import DMListScreen from "../screens/DMListScreen";
import ActivityScreen from "../screens/ActivityScreen";
import ProfileScreen from "../screens/ProfileScreen";
import ChatScreen from "../screens/ChatScreen";
import DirectMessageScreen from "../screens/DirectMessageScreen";
import ChannelDetailsScreen from "../screens/ChannelDetailsScreen";
import SettingsScreen from "../screens/SettingsScreen";
import CreateWorkspaceScreen from "../screens/CreateWorkspaceScreen";
import ThreadsScreen from "../screens/ThreadsScreen";
import LaterScreen from "../screens/LaterScreen";
import DraftsScreen from "../screens/DraftsScreen";
import ScheduledScreen from "../screens/ScheduledScreen";
import NotificationsScreen from "../screens/NotificationsScreen";
import PreferencesScreen from "../screens/PreferencesScreen";
import FilesScreen from "../screens/FilesScreen";
import SearchScreen from "../screens/SearchScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function BottomTabs({ navigation }) {
  const { colors } = useThemeStore();

  return (
    <>
      <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textTertiary,
          tabBarStyle: {
            backgroundColor: colors.background,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingBottom: 8,
            paddingTop: 8,
            height: 60,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "600",
          },
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.textPrimary,
        }}
      >
        <Tab.Screen
          name="HomeTab"
          component={HomeScreen}
          options={{
            headerShown: false,
            tabBarLabel: "Home",
            tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
          }}
        />
        <Tab.Screen
          name="DMsTab"
          component={DMListScreen}
          options={{
            title: "DMs",
            headerShown: false,
            tabBarLabel: "DMs",
            tabBarIcon: ({ color, size }) => (
              <MessageSquare size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="ActivityTab"
          component={ActivityScreen}
          options={{
            headerShown: false,
            tabBarLabel: "Activity",
            tabBarIcon: ({ color, size }) => <Bell size={size} color={color} />,
          }}
        />
        <Tab.Screen
          name="MoreTab"
          component={ProfileScreen}
          options={{
            headerShown: false,
            tabBarLabel: "More",
            tabBarIcon: ({ color, size }) => (
              <MoreHorizontal size={size} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="SearchTab"
          component={SearchScreen}
          options={{
            headerShown: false,
            tabBarLabel: "Search",
            tabBarIcon: ({ color, size }) => (
              <Search size={size} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
      <DrawerNavigation navigation={navigation} />
    </>
  );
}

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
            name="Chat"
            component={ChatScreen}
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="DirectMessage"
            component={DirectMessageScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ChannelDetails"
            component={ChannelDetailsScreen}
            options={{
              headerShown: true,
              title: "Channel Details",
            }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{
              headerShown: true,
              title: "Settings",
            }}
          />
          <Stack.Screen
            name="Threads"
            component={ThreadsScreen}
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
            options={{
              headerShown: true,
              title: "Notifications",
            }}
          />
          <Stack.Screen
            name="Preferences"
            component={PreferencesScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Profile"
            component={ProfileScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Files"
            component={FilesScreen}
            options={{ headerShown: true, title: "Files" }}
          />
          <Stack.Screen
            name="Search"
            component={SearchScreen}
            options={{ headerShown: true, title: "Search" }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
