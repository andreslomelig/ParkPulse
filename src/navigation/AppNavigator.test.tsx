/* eslint-disable @typescript-eslint/no-require-imports */
import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import AppNavigator from "./AppNavigator";
import {
  getCurrentAuthUser,
  signOutCurrentUser,
  subscribeToAuthChanges,
} from "../lib/auth";

jest.mock("../lib/auth", () => ({
  getCurrentAuthUser: jest.fn(),
  signOutCurrentUser: jest.fn(),
  subscribeToAuthChanges: jest.fn(),
}));

jest.mock("../screens/AuthScreen", () => {
  const React = require("react");
  const { Text } = require("react-native");

  return function MockAuthScreen() {
    return React.createElement(Text, null, "Auth Screen");
  };
});

jest.mock("../screens/MapScreen", () => {
  const React = require("react");
  const { Pressable, Text, View } = require("react-native");

  return function MockMapScreen({
    currentUser,
    onSignOut,
  }: {
    currentUser: { fullName: string | null; email: string };
    onSignOut: () => Promise<void>;
  }) {
    return React.createElement(
      View,
      null,
      React.createElement(Text, null, currentUser.fullName ?? currentUser.email),
      React.createElement(
        Pressable,
        { testID: "navigator-sign-out-button", onPress: onSignOut },
        React.createElement(Text, null, "Sign out")
      )
    );
  };
});

describe("AppNavigator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (subscribeToAuthChanges as jest.Mock).mockReturnValue(() => undefined);
  });

  it("shows the auth screen when there is no active session", async () => {
    (getCurrentAuthUser as jest.Mock).mockResolvedValue(null);

    const screen = render(<AppNavigator />);

    await waitFor(() => {
      expect(screen.getByText("Auth Screen")).toBeTruthy();
    });
  });

  it("shows the map when there is an authenticated session", async () => {
    (getCurrentAuthUser as jest.Mock).mockResolvedValue({
      id: "user-1",
      email: "ada@example.com",
      fullName: "Ada Lovelace",
      phone: "+52 449 123 4567",
    });

    const screen = render(<AppNavigator />);

    await waitFor(() => {
      expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    });
  });

  it("passes sign-out through to the map screen", async () => {
    (getCurrentAuthUser as jest.Mock).mockResolvedValue({
      id: "user-1",
      email: "ada@example.com",
      fullName: "Ada Lovelace",
      phone: "+52 449 123 4567",
    });
    (signOutCurrentUser as jest.Mock).mockResolvedValue(undefined);

    const screen = render(<AppNavigator />);

    await waitFor(() => {
      expect(screen.getByTestId("navigator-sign-out-button")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("navigator-sign-out-button"));

    await waitFor(() => {
      expect(signOutCurrentUser).toHaveBeenCalledTimes(1);
    });
  });
});
