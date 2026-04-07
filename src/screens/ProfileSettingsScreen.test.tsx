import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import ProfileSettingsScreen from "./ProfileSettingsScreen";
import {
  fetchCurrentUserProfile,
  upsertCurrentUserProfile,
} from "../lib/profiles";
import {
  fetchThemePreferenceForUser,
  saveThemePreferenceForUser,
} from "../lib/themePreferences";
import {
  pickProfileAvatarImage,
  uploadProfileAvatar,
} from "../lib/avatarUploads";

jest.mock("../lib/profiles", () => ({
  fetchCurrentUserProfile: jest.fn(),
  upsertCurrentUserProfile: jest.fn(),
}));

jest.mock("../lib/themePreferences", () => ({
  APP_THEME_PALETTES: {
    ocean: {
      name: "ocean",
      label: "Oceano",
      description: "Azul",
      primary: "#0f172a",
      primarySoft: "#e0f2fe",
      accent: "#0891b2",
      accentSoft: "#cffafe",
      surface: "#f8fafc",
      surfaceAlt: "#ffffff",
      text: "#0f172a",
      textMuted: "#475569",
    },
    sunset: {
      name: "sunset",
      label: "Atardecer",
      description: "Naranja",
      primary: "#7c2d12",
      primarySoft: "#ffedd5",
      accent: "#ea580c",
      accentSoft: "#fed7aa",
      surface: "#fff7ed",
      surfaceAlt: "#ffffff",
      text: "#431407",
      textMuted: "#9a3412",
    },
    forest: {
      name: "forest",
      label: "Bosque",
      description: "Verde",
      primary: "#14532d",
      primarySoft: "#dcfce7",
      accent: "#16a34a",
      accentSoft: "#bbf7d0",
      surface: "#f0fdf4",
      surfaceAlt: "#ffffff",
      text: "#052e16",
      textMuted: "#166534",
    },
  },
  fetchThemePreferenceForUser: jest.fn(),
  saveThemePreferenceForUser: jest.fn(),
  getThemePalette: jest.fn((themeName: string) => ({
    name: themeName,
    label: themeName,
    description: themeName,
    primary: "#0f172a",
    primarySoft: "#e0f2fe",
    accent: "#0891b2",
    accentSoft: "#cffafe",
    surface: "#f8fafc",
    surfaceAlt: "#ffffff",
    text: "#0f172a",
    textMuted: "#475569",
  })),
}));

jest.mock("../lib/avatarUploads", () => ({
  pickProfileAvatarImage: jest.fn(),
  uploadProfileAvatar: jest.fn(),
}));

jest.mock("../lib/supabase", () => ({
  isSupabaseConfigured: true,
}));

describe("ProfileSettingsScreen", () => {
  const currentUser = {
    id: "user-1",
    email: "ada@example.com",
    fullName: "Ada Lovelace",
    phone: "+52 449 123 4567",
    avatarUrl: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (fetchCurrentUserProfile as jest.Mock).mockResolvedValue({
      userId: "user-1",
      email: "ada@example.com",
      phone: "+52 449 000 1111",
      fullName: "Ada Lovelace",
      preferredName: "Ada",
      avatarUrl: "https://example.com/avatar.png",
      source: "remote",
    });
    (upsertCurrentUserProfile as jest.Mock).mockResolvedValue({
      userId: "user-1",
      email: "ada@example.com",
      phone: "+52 449 777 8888",
      fullName: "Ada Lovelace",
      preferredName: "Ada Park",
      avatarUrl: "https://example.com/avatar-2.png",
      source: "remote",
    });
    (fetchThemePreferenceForUser as jest.Mock).mockResolvedValue("sunset");
    (saveThemePreferenceForUser as jest.Mock).mockResolvedValue("forest");
    (pickProfileAvatarImage as jest.Mock).mockResolvedValue(null);
    (uploadProfileAvatar as jest.Mock).mockResolvedValue(
      "https://project.supabase.co/storage/v1/object/public/avatars/user-1/avatar.jpg?updatedAt=1712345678901"
    );
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  it("loads the current profile and theme", async () => {
    const screen = render(
      <ProfileSettingsScreen
        currentUser={currentUser}
        onCancel={jest.fn()}
        onProfileSaved={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Ada")).toBeTruthy();
      expect(screen.getByDisplayValue("+52 449 000 1111")).toBeTruthy();
      expect(screen.getByDisplayValue("https://example.com/avatar.png")).toBeTruthy();
    });
  });

  it("saves profile fields and the selected theme", async () => {
    const onProfileSaved = jest.fn();
    const screen = render(
      <ProfileSettingsScreen
        currentUser={currentUser}
        onCancel={jest.fn()}
        onProfileSaved={onProfileSaved}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("profile-theme-forest")).toBeTruthy();
    });

    fireEvent.changeText(screen.getByTestId("profile-preferred-name-input"), "Ada Park");
    fireEvent.changeText(screen.getByTestId("profile-phone-input"), "+52 449 777 8888");
    fireEvent.changeText(
      screen.getByTestId("profile-avatar-url-input"),
      "https://example.com/avatar-2.png"
    );
    fireEvent.press(screen.getByTestId("profile-theme-forest"));
    fireEvent.press(screen.getByTestId("save-profile-settings-button"));

    await waitFor(() => {
      expect(saveThemePreferenceForUser).toHaveBeenCalledWith("user-1", "forest");
      expect(upsertCurrentUserProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          preferredName: "Ada Park",
          phone: "+52 449 777 8888",
          avatarUrl: "https://example.com/avatar-2.png",
        })
      );
      expect(onProfileSaved).toHaveBeenCalledWith({
        fullName: "Ada Park",
        phone: "+52 449 777 8888",
        avatarUrl: "https://example.com/avatar-2.png",
        themeName: "forest",
      });
    });
  });

  it("allows choosing a local photo and uploads it on save", async () => {
    const onProfileSaved = jest.fn();
    (pickProfileAvatarImage as jest.Mock).mockResolvedValue({
      localUri: "file:///avatar-local.jpg",
      mimeType: "image/jpeg",
      fileExtension: "jpg",
    });
    (upsertCurrentUserProfile as jest.Mock).mockResolvedValue({
      userId: "user-1",
      email: "ada@example.com",
      phone: "+52 449 000 1111",
      fullName: "Ada Lovelace",
      preferredName: "Ada",
      avatarUrl:
        "https://project.supabase.co/storage/v1/object/public/avatars/user-1/avatar.jpg?updatedAt=1712345678901",
      source: "remote",
    });

    const screen = render(
      <ProfileSettingsScreen
        currentUser={currentUser}
        onCancel={jest.fn()}
        onProfileSaved={onProfileSaved}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("pick-profile-avatar-button")).toBeTruthy();
      expect(screen.getByTestId("save-profile-settings-button")).toBeTruthy();
      expect(screen.getByDisplayValue("https://example.com/avatar.png")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("pick-profile-avatar-button"));
    });

    expect(pickProfileAvatarImage).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId("save-profile-settings-button"));

    await waitFor(() => {
      expect(uploadProfileAvatar).toHaveBeenCalledWith({
        localUri: "file:///avatar-local.jpg",
        mimeType: "image/jpeg",
        fileExtension: "jpg",
      });
      expect(onProfileSaved).toHaveBeenCalledWith({
        fullName: "Ada",
        phone: "+52 449 000 1111",
        avatarUrl:
          "https://project.supabase.co/storage/v1/object/public/avatars/user-1/avatar.jpg?updatedAt=1712345678901",
        themeName: "forest",
      });
    });
  });
});
