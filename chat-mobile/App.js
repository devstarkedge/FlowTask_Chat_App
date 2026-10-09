import React, { useEffect, useRef, useState } from "react";
import './src/i18n';
import { Keyboard, Dimensions, AppState } from "react-native";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './src/queries/queryClient';
import { restoreNavigationState, saveNavigationState, isNavigationEntryUrl } from './src/services/navigationRecovery';

import AppNavigator from "./src/navigation/AppNavigation";
import { useAuthStore } from "./src/stores/authStore";
import { useThemeStore } from "./src/stores/themeStore";
import { usePreferencesStore } from "./src/stores/preferencesStore";
import { useWorkspaceStore } from "./src/stores/workspaceStore";
import { useChatStore } from "./src/stores/chatStore";
import { connectSocket, disconnectSocket } from "./src/services/socket";
import { initNetworkMonitor, destroyNetworkMonitor } from "./src/services/networkMonitor";
import { registerForPushNotifications, setNavigationRef, handlePushNavigationReady } from "./src/services/pushNotificationService";
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
  const authInitialized = useAuthStore((state) => state.isInitialized);
  const userId = useAuthStore((state) => state.user?._id || state.user?.id);
  const activeWorkspaceId = useWorkspaceStore((state) => state?.activeWorkspaceId ?? null);
  const themeSubscriptionRef = useRef(null);
  const [workspaceHydrated, setWorkspaceHydrated] = useState(() => useWorkspaceStore.persist.hasHydrated());
  const [navigationRestore, setNavigationRestore] = useState({ ready: false, state: undefined });

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(workspaceHydrated ? undefined : useWorkspaceStore.persist.rehydrate())
      .catch(error => console.warn('[Startup] Workspace restore failed:', error?.message))
      .finally(() => { if (!cancelled) setWorkspaceHydrated(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (navigationRestore.ready || !authInitialized || !workspaceHydrated) return;
    let cancelled = false;
    (async () => {
      const initialUrl = await Linking.getInitialURL();
      const state = accessToken ? await restoreNavigationState(userId, activeWorkspaceId, isNavigationEntryUrl(initialUrl) ? initialUrl : null) : undefined;
      if (!cancelled) setNavigationRestore({ ready: true, state });
    })().catch(error => {
      console.warn('[Navigation] Restore failed:', error?.message);
      if (!cancelled) setNavigationRestore({ ready: true, state: undefined });
    });
    return () => { cancelled = true; };
  }, [authInitialized, workspaceHydrated, accessToken, userId, activeWorkspaceId, navigationRestore.ready]);

  const persistNavigation = state => {
    if (!accessToken) return;
    saveNavigationState(userId, activeWorkspaceId, state, () => {
      const auth = useAuthStore.getState();
      return !!auth.accessToken && (auth.user?._id || auth.user?.id) === userId
        && useWorkspaceStore.getState().activeWorkspaceId === activeWorkspaceId;
    }).catch(error => console.warn('[Navigation] Save failed:', error?.message));
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active' && navigationRef.isReady()) persistNavigation(navigationRef.getRootState());
    });
    return () => subscription.remove();
  }, [accessToken, userId, activeWorkspaceId]);



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
    })().catch(error => console.warn('[Startup] Initialization failed:', error?.message));
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
    if (!accessToken) return;
    const refresh = () => useAuthStore.getState().refreshUser().catch(error => {
      console.warn('[Profile] Current user refresh failed:', error?.message);
    });
    refresh();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, [accessToken, activeWorkspaceId]);

  // Register for push notifications once auth + workspace are ready
  useEffect(() => {
    if (accessToken && activeWorkspaceId) {
      registerForPushNotifications();
      handlePushNavigationReady();
      const appState = AppState.addEventListener('change', state => {
        if (state === 'active') {
          registerForPushNotifications();
          handlePushNavigationReady();
        }
      });
      const unsubscribeNetwork = useChatStore.subscribe((state, previous) => {
        if (state.connectionStatus === 'connected' && previous.connectionStatus !== 'connected') registerForPushNotifications();
      });
      return () => { appState.remove(); unsubscribeNetwork(); };
    }
  }, [accessToken, activeWorkspaceId]);

  // Wire navigation ref to push service
  useEffect(() => {
    setNavigationRef(navigationRef);
  }, []);


  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <ErrorBoundary>
            <ThemeProvider>
              <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
                {navigationRestore.ready && <NavigationContainer ref={navigationRef} linking={linking} initialState={navigationRestore.state}
                  onReady={() => { persistNavigation(navigationRef.getRootState()); handlePushNavigationReady(); }}
                  onStateChange={state => { persistNavigation(state); handlePushNavigationReady(); }}>
                  <AppNavigator />
                  <GlobalToastProvider />
                </NavigationContainer>}
              </KeyboardProvider>  
            </ThemeProvider>
          </ErrorBoundary>
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
