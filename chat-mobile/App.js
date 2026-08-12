import React, { useEffect, useRef } from "react";
import { Keyboard, Dimensions } from "react-native";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import AppNavigator from "./src/navigation/AppNavigation";
import { useAuthStore } from "./src/stores/authStore";
import { useThemeStore } from "./src/stores/themeStore";
import { usePreferencesStore } from "./src/stores/preferencesStore";
import { useWorkspaceStore } from "./src/stores/workspaceStore";
import { connectSocket, disconnectSocket } from "./src/services/socket";
import { initNetworkMonitor, destroyNetworkMonitor } from "./src/services/networkMonitor";
import { registerForPushNotifications, setNavigationRef } from "./src/services/pushNotificationService";
import { conversationPresence } from "./src/services/conversationPresence";
import ErrorBoundary from "./src/components/ErrorBoundary";
import Toast from "react-native-toast-message";
import { toastConfig } from "./src/config/toastConfig";
import { GlobalToastProvider } from "./src/components/common/GlobalToastProvider";
import { useToastStore } from "./src/utils/toastStore";

Toast.show = (options) => useToastStore.getState().show(options);
Toast.hide = () => useToastStore.getState().hide();
import ThemeProvider from './src/theme/ThemeProvider';

import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useNotificationPrefStore } from "./src/stores/notificationPrefStore";
import { KeyboardProvider } from "react-native-keyboard-controller";

import * as Linking from 'expo-linking';

const navigationRef = createNavigationContainerRef();
const queryClient = new QueryClient();

const linking = {
  prefixes: [
    Linking.createURL('/'),
    'flowtaskchat://',
    'https://chat.flowtask.com',
    'https://chat-app-api-cyyl.onrender.com'
  ],
  config: {
    screens: {
      InviteProcessing: 'invite/:inviteCode',
    },
  },
};

export default function App() {
  const init = useAuthStore((state) => state.init);
  const initTheme = useThemeStore((state) => state.init);
  const initPrefs = usePreferencesStore((state) => state.init);
  const fetchNotifPrefs = useNotificationPrefStore((state) => state.fetchPreferences);
  const accessToken = useAuthStore((state) => state.accessToken);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const themeSubscriptionRef = useRef(null);



  // Initialize auth FIRST (primes token cache), then theme
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1. Restore auth tokens and prime API cache
      await init();
      if (cancelled) return;
      // 2. Now safe to init theme (API call requires auth token)
      const subscription = await initTheme();
      await initPrefs();
      fetchNotifPrefs();
      if (cancelled) {
        subscription?.remove();
        return;
      }
      themeSubscriptionRef.current = subscription;
    })();
    return () => {
      cancelled = true;
      if (themeSubscriptionRef.current) {
        themeSubscriptionRef.current.remove();
        themeSubscriptionRef.current = null;
      }
    };
  }, [init, initTheme]);

  // Manage socket connection at app level based on auth + workspace state
  useEffect(() => {
    if (accessToken && activeWorkspaceId) {
      connectSocket();
      // Initialize the network monitor to flush offline queue on reconnect
      initNetworkMonitor();
      conversationPresence.setup();
    } else {
      disconnectSocket();
      destroyNetworkMonitor();
      conversationPresence.clearActive();
    }
    return () => {
      conversationPresence.clearActive();
      conversationPresence.cleanup();
      disconnectSocket();
      destroyNetworkMonitor();
    };
  }, [accessToken, activeWorkspaceId]);

  // Register for push notifications once auth + workspace are ready
  useEffect(() => {
    if (accessToken && activeWorkspaceId) {
      registerForPushNotifications();
    }
  }, [accessToken, activeWorkspaceId]);

  // Wire navigation ref to push service
  useEffect(() => {
    setNavigationRef(navigationRef);
  }, []);


  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <ErrorBoundary>
            <ThemeProvider>
              <KeyboardProvider>
                <NavigationContainer ref={navigationRef} linking={linking}>
                  <AppNavigator />
                  <GlobalToastProvider />
                </NavigationContainer>
              </KeyboardProvider>
            </ThemeProvider>
          </ErrorBoundary>
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
