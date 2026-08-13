import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { DiningPlanProvider } from '@/context/dining-plan-context';

void SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore if splash control has already been configured by Expo runtime.
});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    // Required by react-native-gesture-handler so native swipe/pan gestures
    // (e.g. the Stack's swipe-back) are recognized reliably, especially on Android.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <DiningPlanProvider>
          <AnimatedSplashOverlay />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'fade_from_bottom',
              gestureEnabled: true,
            }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="meal-plan-setup" />
            <Stack.Screen name="meal-plan-other" />
            <Stack.Screen name="meter-details" />
            <Stack.Screen name="settings" />
          </Stack>
        </DiningPlanProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
