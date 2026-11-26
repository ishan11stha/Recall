import React from 'react';
import { Tabs } from 'expo-router';
import { FileText, Layers, Orbit } from 'lucide-react-native';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function TabsLayout() {
  const { colors, fonts } = useTheme();

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
          height: 62,
          paddingTop: 6,
          paddingBottom: 8,
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
          tabBarIcon: ({ color, size }) => (
            <Layers size={size - 3} color={color} strokeWidth={1.75} />
          ),
        }}
      />
    </Tabs>
  );
}
