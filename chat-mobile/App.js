import React, { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import AppNavigator from "./src/navigation/AppNavigation";
import { useAuthStore } from "./src/stores/authStore";
import { useThemeStore } from "./src/stores/themeStore";
import Toast from "react-native-toast-message";

export default function App() {
  const init = useAuthStore((state) => state.init);
  const initTheme = useThemeStore((state) => state.init);

  useEffect(() => {
    init();
    initTheme();
  }, [init, initTheme]);

  return (
    <NavigationContainer>
      <AppNavigator />
      <Toast />
    </NavigationContainer>
  );
}