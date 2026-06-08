import React, { useEffect, useRef } from "react";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import AppNavigator from "./src/navigation/AppNavigation";
import { useAuthStore } from "./src/stores/authStore";
import { useThemeStore } from "./src/stores/themeStore";
import { useWorkspaceStore } from "./src/stores/workspaceStore";
import { connectSocket, disconnectSocket } from "./src/services/socket";
import { registerForPushNotifications, setNavigationRef } from "./src/services/pushNotificationService";
import ErrorBoundary from "./src/components/ErrorBoundary";
import Toast from "react-native-toast-message";

const navigationRef = createNavigationContainerRef();

export default function App() {
  const init = useAuthStore((state) => state.init);
  const initTheme = useThemeStore((state) => state.init);
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
    } else {
      disconnectSocket();
    }
    return () => {
      disconnectSocket();
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
    <ErrorBoundary>
      <NavigationContainer ref={navigationRef}>
        <AppNavigator />
        <Toast />
      </NavigationContainer>
    </ErrorBoundary>
  );
}
