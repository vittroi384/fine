import { Tabs } from "expo-router";
import { Text } from "react-native";

import { ko } from "@/i18n/ko";
import { colors } from "@/lib/theme";

export default function GroupLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSub,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: ko.group.feedTab,
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18 }}>📷</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="ledger"
        options={{
          title: ko.group.ledgerTab,
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 18 }}>📒</Text>
          ),
        }}
      />
      <Tabs.Screen name="checkin" options={{ href: null, tabBarStyle: { display: "none" } }} />
      <Tabs.Screen name="dispute/[checkinId]" options={{ href: null }} />
    </Tabs>
  );
}
