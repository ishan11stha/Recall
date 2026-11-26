import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Newsreader_400Regular,
  Newsreader_500Medium,
  Newsreader_600SemiBold,
} from '@expo-google-fonts/newsreader';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';
import { useAppStore } from '../src/stores/useAppStore';
import { getDatabase } from '../src/database/client';
import { loadAppSettings } from '../src/database/repositories/settingsRepo';
import { ErrorBoundary } from '../src/components/ui/ErrorBoundary';
import { AppText } from '../src/components/ui/AppText';

function RootNavigator() {
  const theme = useTheme();
  const isReady = useAppStore((s) => s.isReady);
  const setReady = useAppStore((s) => s.setReady);
  const setSettings = useAppStore((s) => s.setSettings);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const db = await getDatabase();
        const loaded = await loadAppSettings(db);
        if (!mounted) return;
        setSettings(loaded);
        setReady(true);
      } catch (err) {
        if (mounted) {
          setInitError(err instanceof Error ? err.message : 'Failed to initialize database.');
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [setReady, setSettings]);

  if (initError) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <AppText variant="h2">Database Error</AppText>
        <AppText variant="bodySmall" color="secondary" style={{ textAlign: 'center' }}>
          {initError}
        </AppText>
      </View>
    );
  }

  if (!isReady) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="small" color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
          animation: 'fade_from_bottom',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="notes/[id]" />
        <Stack.Screen name="flashcards/edit/[id]" />
        <Stack.Screen name="flashcards/session" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const settings = useAppStore((s) => s.settings);

  const [fontsLoaded] = useFonts({
    Newsreader_400Regular,
    Newsreader_500Medium,
    Newsreader_600SemiBold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    JetBrainsMono_400Regular,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider mode={settings.theme} fontSize={settings.fontSize}>
          <ErrorBoundary>
            <RootNavigator />
          </ErrorBoundary>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 24,
  },
});
