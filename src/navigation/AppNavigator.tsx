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
import PlaceReviewScreen from "../screens/PlaceReviewScreen";
import PrivacyLegalScreen from "../screens/PrivacyLegalScreen";
import ReportHistoryScreen from "../screens/ReportHistoryScreen";
import SavedPlacesScreen from "../screens/SavedPlacesScreen";

export type RootStackParamList = {
  Auth: undefined;
  Map:
    | {
        focusPlaceId?: string;
        focusPlaceRequestId?: number;
        refreshPlaceRequestId?: number;
      }
    | undefined;
  PlaceReview: {
    placeId: string;
    placeName?: string | null;
  };
  PrivacyLegal: undefined;
  ReportHistory: undefined;
  SavedPlaces: undefined;
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
              {({ navigation, route }) => (
                <MapScreen
                  currentUser={currentUser}
                  onSignOut={signOutCurrentUser}
                  onOpenPrivacyLegal={() => navigation.navigate("PrivacyLegal")}
                  onOpenReportHistory={() => navigation.navigate("ReportHistory")}
                  onOpenSavedPlaces={() => navigation.navigate("SavedPlaces")}
                  onOpenPlaceReview={(place) =>
                    navigation.navigate("PlaceReview", {
                      placeId: place.id,
                      placeName: place.name,
                    })
                  }
                  pendingFocusPlaceId={route.params?.focusPlaceId ?? null}
                  pendingFocusRequestId={route.params?.focusPlaceRequestId ?? null}
                  pendingPlaceRefreshRequestId={
                    route.params?.refreshPlaceRequestId ?? null
                  }
                />
              )}
            </Stack.Screen>
            <Stack.Screen
              name="PlaceReview"
              options={{ title: "Escribir reseña" }}
            >
              {({ navigation, route }) => (
                <PlaceReviewScreen
                  currentUser={currentUser}
                  placeId={route.params.placeId}
                  placeName={route.params.placeName}
                  onCancel={() => navigation.goBack()}
                  onReviewSaved={(placeId) =>
                    navigation.navigate("Map", {
                      focusPlaceId: placeId,
                      focusPlaceRequestId: Date.now(),
                      refreshPlaceRequestId: Date.now(),
                    })
                  }
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
              name="SavedPlaces"
              options={{ title: "Lugares guardados" }}
            >
              {({ navigation }) => (
                <SavedPlacesScreen
                  currentUser={currentUser}
                  onOpenPlace={(placeId) =>
                    navigation.navigate("Map", {
                      focusPlaceId: placeId,
                      focusPlaceRequestId: Date.now(),
                    })
                  }
                />
              )}
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
