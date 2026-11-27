import React, { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FileText, Layers, Orbit } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';
import { useAppStore } from '../../src/stores/useAppStore';
import { getDatabase } from '../../src/database/client';
import { listFlashcards } from '../../src/database/repositories/flashcardsRepo';

export default function TabsLayout() {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const dataVersion = useAppStore((s) => s.dataVersion);
  const [dueCount, setDueCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const db = await getDatabase();
        const due = await listFlashcards(db, { dueOnly: true });
        if (mounted) setDueCount(due.length);
      } catch {
        // ignore if DB not yet initialized
      }
    })();
    return () => {
      mounted = false;
    };
  }, [dataVersion]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 56 + Math.max(8, insets.bottom),
          paddingTop: 6,
          paddingBottom: Math.max(8, insets.bottom),
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.sansMedium,
          fontSize: 11,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Notes',
          tabBarIcon: ({ color, size }) => (
            <FileText size={size - 3} color={color} strokeWidth={1.75} />
          ),
        }}
      />
      <Tabs.Screen
        name="mindmap"
        options={{
          title: 'Mind Map',
          tabBarIcon: ({ color, size }) => (
            <Orbit size={size - 3} color={color} strokeWidth={1.75} />
          ),
        }}
      />
      <Tabs.Screen
        name="review"
        options={{
          title: 'Review',
          tabBarBadge: dueCount > 0 ? dueCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.accent,
            color: colors.accentText,
            fontSize: 10,
            minWidth: 18,
            height: 18,
            lineHeight: 16,
          },
          tabBarIcon: ({ color, size }) => (
            <Layers size={size - 3} color={color} strokeWidth={1.75} />
          ),
        }}
      />
    </Tabs>
  );
}
