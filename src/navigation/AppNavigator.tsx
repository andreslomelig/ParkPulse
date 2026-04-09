import React, { useEffect, useMemo, useState } from "react";
import { DefaultTheme, NavigationContainer } from "@react-navigation/native";
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
import ProfileSettingsScreen from "../screens/ProfileSettingsScreen";
import ReportHistoryScreen from "../screens/ReportHistoryScreen";
import SavedPlacesScreen from "../screens/SavedPlacesScreen";
import { fetchCurrentUserProfile } from "../lib/profiles";
import {
  fetchThemePreferenceForUser,
  getThemePalette,
  type AppThemeName,
} from "../lib/themePreferences";
import { AppThemeProvider } from "../theme/AppThemeContext";

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
  ProfileSettings: undefined;
  ReportHistory: undefined;
  SavedPlaces: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const [currentUser, setCurrentUser] = useState<AuthenticatedAppUser | null>(null);
  const [themeName, setThemeName] = useState<AppThemeName>("ocean");
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const selectedTheme = useMemo(() => getThemePalette(themeName), [themeName]);
  const navigationTheme = useMemo(
    () => ({
      ...DefaultTheme,
      colors: {
        ...DefaultTheme.colors,
        primary: selectedTheme.accent,
        background: selectedTheme.surface,
        card: selectedTheme.surfaceAlt,
        text: selectedTheme.text,
        border: selectedTheme.accentSoft,
        notification: selectedTheme.accent,
      },
    }),
    [selectedTheme]
  );

  useEffect(() => {
    let active = true;

    const syncCurrentUserProfile = async (baseUser: AuthenticatedAppUser | null) => {
      if (!active) return;

      if (!baseUser) {
        setCurrentUser(null);
        setThemeName("ocean");
        setIsAuthLoading(false);
        return;
      }

      try {
        const [profileResult, themeResult] = await Promise.allSettled([
          fetchCurrentUserProfile(),
          fetchThemePreferenceForUser(baseUser.id),
        ]);
        if (!active) return;

        const profile = profileResult.status === "fulfilled" ? profileResult.value : null;
        const nextThemeName = themeResult.status === "fulfilled" ? themeResult.value : "ocean";

        setThemeName(nextThemeName);
        setCurrentUser({
          ...baseUser,
          fullName: profile?.preferredName ?? profile?.fullName ?? baseUser.fullName,
          phone: profile?.phone ?? baseUser.phone,
          avatarUrl: profile?.avatarUrl ?? baseUser.avatarUrl,
        });
      } catch (error) {
        console.error(error);
        if (!active) return;
        setThemeName("ocean");
        setCurrentUser(baseUser);
      } finally {
        if (active) {
          setIsAuthLoading(false);
        }
      }
    };

    getCurrentAuthUser()
      .then((user) => {
        if (!active) return;
        void syncCurrentUserProfile(user);
      })
      .catch((error) => {
        console.error(error);
        if (!active) return;
        setCurrentUser(null);
        setIsAuthLoading(false);
      });

    const unsubscribe = subscribeToAuthChanges((user) => {
      if (!active) return;
      void syncCurrentUserProfile(user);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (isAuthLoading) {
    return (
      <View
        style={[
          styles.loadingContainer,
          { backgroundColor: selectedTheme.primarySoft },
        ]}
      >
        <ActivityIndicator size="large" color={selectedTheme.accent} />
        <Text style={[styles.loadingTitle, { color: selectedTheme.text }]}>
          Cargando sesión...
        </Text>
      </View>
    );
  }

  return (
    <AppThemeProvider themeName={themeName}>
      <NavigationContainer theme={navigationTheme}>
        <Stack.Navigator
          screenOptions={{
            contentStyle: { backgroundColor: selectedTheme.surface },
            headerStyle: { backgroundColor: selectedTheme.surfaceAlt },
            headerTintColor: selectedTheme.text,
            headerTitleStyle: { fontWeight: "800" },
            headerShadowVisible: false,
          }}
        >
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
                  onOpenProfileSettings={() => navigation.navigate("ProfileSettings")}
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
                    navigation.reset({
                      index: 0,
                      routes: [
                        {
                          name: "Map",
                          params: {
                            focusPlaceId: placeId,
                            focusPlaceRequestId: Date.now(),
                            refreshPlaceRequestId: Date.now(),
                          },
                        },
                      ],
                    })
                  }
                />
              )}
            </Stack.Screen>
            <Stack.Screen
              name="ProfileSettings"
              options={{ title: "Perfil y tema" }}
            >
              {({ navigation }) => (
                <ProfileSettingsScreen
                  currentUser={currentUser}
                  onCancel={() => navigation.goBack()}
                  onProfileSaved={({
                    fullName,
                    phone,
                    avatarUrl,
                    themeName: nextThemeName,
                  }: {
                    fullName: string | null;
                    phone: string | null;
                    avatarUrl: string | null;
                    themeName: AppThemeName;
                  }) => {
                    setThemeName(nextThemeName);
                    setCurrentUser((previousUser) =>
                      previousUser
                        ? {
                            ...previousUser,
                            fullName: fullName ?? previousUser.fullName,
                            phone,
                            avatarUrl,
                          }
                        : previousUser
                    );
                    navigation.goBack();
                  }}
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
    </AppThemeProvider>
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
