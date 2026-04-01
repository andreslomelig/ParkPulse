import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MapScreen from "../screens/MapScreen";
import PrivacyLegalScreen from "../screens/PrivacyLegalScreen";

export type RootStackParamList = {
  Map: undefined;
  PrivacyLegal: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="Map"
          options={{ title: "ParkPulse" }}
        >
          {({ navigation }) => (
            <MapScreen onOpenPrivacyLegal={() => navigation.navigate("PrivacyLegal")} />
          )}
        </Stack.Screen>
        <Stack.Screen
          name="PrivacyLegal"
          component={PrivacyLegalScreen}
          options={{ title: "Privacidad y legal" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
