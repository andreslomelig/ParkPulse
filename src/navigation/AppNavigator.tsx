import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import {
  getCurrentAuthUser,
  signOutCurrentUser,
  subscribeToAuthChanges,
  type AuthenticatedAppUser,
} from "../lib/auth";
import AuthScreen from "../screens/AuthScreen";
import MapScreen from "../screens/MapScreen";
import PrivacyLegalScreen from "../screens/PrivacyLegalScreen";
import ReportHistoryScreen from "../screens/ReportHistoryScreen";

export type RootStackParamList = {
  Auth: undefined;
  Map: undefined;
  PrivacyLegal: undefined;
  ReportHistory: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const [currentUser, setCurrentUser] = useState<AuthenticatedAppUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    let active = true;

    getCurrentAuthUser()
      .then((user) => {
        if (!active) return;
        setCurrentUser(user);
        setIsAuthLoading(false);
      })
      .catch((error) => {
        console.error(error);
        if (!active) return;
        setCurrentUser(null);
        setIsAuthLoading(false);
      });

    const unsubscribe = subscribeToAuthChanges((user) => {
      if (!active) return;
      setCurrentUser(user);
      setIsAuthLoading(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (isAuthLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0f172a" />
        <Text style={styles.loadingTitle}>Cargando sesion...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {currentUser ? (
          <>
            <Stack.Screen
              name="Map"
              options={{ title: "ParkPulse" }}
            >
              {({ navigation }) => (
                <MapScreen
                  currentUser={currentUser}
                  onSignOut={signOutCurrentUser}
                  onOpenPrivacyLegal={() => navigation.navigate("PrivacyLegal")}
                  onOpenReportHistory={() => navigation.navigate("ReportHistory")}
                />
              )}
            </Stack.Screen>
            <Stack.Screen
              name="ReportHistory"
              options={{ title: "Historial de reportes" }}
            >
              {() => <ReportHistoryScreen currentUser={currentUser} />}
            </Stack.Screen>
            <Stack.Screen
              name="PrivacyLegal"
              component={PrivacyLegalScreen}
              options={{ title: "Privacidad y legal" }}
            />
          </>
        ) : (
          <Stack.Screen
            name="Auth"
            component={AuthScreen}
            options={{ headerShown: false }}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e2e8f0",
    padding: 24,
  },
  loadingTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
});
