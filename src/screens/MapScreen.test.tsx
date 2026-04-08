import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import * as Location from "expo-location";
import BottomSheet from "@gorhom/bottom-sheet";
import MapScreen from "./MapScreen";
import {
  createParkingPlace,
  fetchPlaceById,
  fetchPlaces,
} from "../lib/places";
import {
  fetchRecentReports,
  fetchReportsForPlace,
  reactToParkingReport,
  submitParkingReport,
} from "../lib/reports";
import { fetchPlaceReviews } from "../lib/reviews";
import type { AuthenticatedAppUser } from "../lib/auth";
import {
  fetchSavedPlaceIds,
  toggleSavedPlaceForUser,
} from "../lib/savedPlaces";

jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 1 },
}));

jest.mock("../lib/places", () => ({
  fetchPlaces: jest.fn(),
  fetchPlaceById: jest.fn(),
  createParkingPlace: jest.fn(),
}));

jest.mock("../lib/reports", () => ({
  fetchRecentReports: jest.fn(),
  fetchReportsForPlace: jest.fn(),
  reactToParkingReport: jest.fn(),
  submitParkingReport: jest.fn(),
}));

jest.mock("../lib/reviews", () => ({
  fetchPlaceReviews: jest.fn(),
}));

jest.mock("../lib/savedPlaces", () => ({
  fetchSavedPlaceIds: jest.fn(),
  toggleSavedPlaceForUser: jest.fn(),
  mapSavedPlaces: jest.requireActual("../lib/savedPlaces").mapSavedPlaces,
}));

const basePlaces = [
  {
    id: "fallback-1",
    name: "Centro - Plaza Patria",
    description: "Estacionamiento central",
    address: "Centro",
    latitude: 21.8817,
    longitude: -102.2961,
    status: "available",
    updatedAt: "2026-03-19T18:00:00.000Z",
    lastReportedAt: "2026-03-19T18:00:00.000Z",
    activeReportCount: 2,
    totalReportCount: 4,
    averageRating: 4.2,
    ratingCount: 10,
    costType: "paid",
    currencyCode: "MXN",
    hourlyCostMin: 20,
    hourlyCostMax: 30,
    costNotes: "Tarifa urbana",
    capacityMin: 50,
    capacityMax: 80,
    capacityConfidence: "range",
    accessType: "public",
    source: "remote",
  },
  {
    id: "fallback-2",
    name: "Zona Feria - Estadio",
    description: "Cerca del estadio",
    address: "Zona Feria",
    latitude: 21.8728,
    longitude: -102.3091,
    status: "full",
    updatedAt: "2026-03-19T17:40:00.000Z",
    lastReportedAt: "2026-03-19T17:40:00.000Z",
    activeReportCount: 1,
    totalReportCount: 2,
    averageRating: 3.7,
    ratingCount: 6,
    costType: "paid",
    currencyCode: "MXN",
    hourlyCostMin: 25,
    hourlyCostMax: 35,
    costNotes: "Tarifa por evento",
    capacityMin: 120,
    capacityMax: 220,
    capacityConfidence: "estimated",
    accessType: "public",
    source: "remote",
  },
];

const currentUser: AuthenticatedAppUser = {
  id: "user-1",
  email: "ada@example.com",
  fullName: "Ada Lovelace",
  phone: "+52 449 123 4567",
  avatarUrl: null,
};

function renderMapScreen(overrideProps: Partial<React.ComponentProps<typeof MapScreen>> = {}) {
  return render(
    <MapScreen
      currentUser={currentUser}
      onSignOut={jest.fn()}
      {...overrideProps}
    />
  );
}

describe("MapScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (fetchPlaces as jest.Mock).mockResolvedValue(basePlaces);
    (fetchPlaceById as jest.Mock).mockResolvedValue({
      ...basePlaces[0],
      status: "available",
      updatedAt: "2026-03-19T18:12:00.000Z",
      lastReportedAt: "2026-03-19T18:12:00.000Z",
      totalReportCount: 5,
    });
    (createParkingPlace as jest.Mock).mockResolvedValue({
      id: "remote-place-3",
      name: "Nuevo estacionamiento",
      description: "Nuevo punto creado por la comunidad",
      address: "Referencia nueva",
      latitude: 21.88234,
      longitude: -102.28259,
      status: "unknown",
      updatedAt: "2026-03-19T19:00:00.000Z",
      lastReportedAt: null,
      activeReportCount: 0,
      totalReportCount: 0,
      averageRating: null,
      ratingCount: 0,
      costType: "paid",
      currencyCode: "MXN",
      hourlyCostMin: 15,
      hourlyCostMax: 25,
      costNotes: "Tarifa base",
      capacityMin: 30,
      capacityMax: 60,
      capacityConfidence: "range",
      accessType: "public",
      source: "remote",
    });

    (fetchRecentReports as jest.Mock).mockResolvedValue([
      {
        id: "remote-report-1",
        placeId: "fallback-2",
        placeName: "Historial remoto",
        status: "full",
        note: "Muy saturado",
        createdAt: "2026-03-19T18:10:00.000Z",
        expiresAt: "2026-03-19T18:40:00.000Z",
        reportedDistanceMeters: 18,
        reporterUserId: null,
        reporterDisplayName: "Comunidad",
        confirmCount: 0,
        disputeCount: 0,
        source: "remote",
      },
    ]);

    (fetchReportsForPlace as jest.Mock).mockResolvedValue([
      {
        id: "remote-place-report-1",
        placeId: "fallback-1",
        placeName: "Centro - Plaza Patria",
        status: "available",
        note: "Se libero una fila",
        createdAt: "2026-03-19T18:09:00.000Z",
        expiresAt: "2026-03-19T18:24:00.000Z",
        reportedDistanceMeters: 22,
        reporterUserId: null,
        reporterDisplayName: "Comunidad",
        source: "remote",
      },
    ]);

    (submitParkingReport as jest.Mock).mockResolvedValue({
      id: "remote-report-2",
      placeId: "fallback-1",
      placeName: "Centro - Plaza Patria",
      status: "available",
      note: null,
      createdAt: "2026-03-19T18:12:00.000Z",
      expiresAt: "2026-03-19T18:27:00.000Z",
      reportedDistanceMeters: 11,
      reporterUserId: null,
      reporterDisplayName: "Comunidad",
      confirmCount: 0,
      disputeCount: 0,
      source: "remote",
    });
    (reactToParkingReport as jest.Mock).mockResolvedValue({
      id: "remote-place-report-1",
      placeId: "fallback-1",
      placeName: "Centro - Plaza Patria",
      status: "available",
      note: "Se libero una fila",
      createdAt: "2026-03-19T18:09:00.000Z",
      expiresAt: "2026-03-19T18:24:00.000Z",
      reportedDistanceMeters: 22,
      reporterUserId: null,
      reporterDisplayName: "Comunidad",
      confirmCount: 2,
      disputeCount: 0,
      source: "remote",
    });
    (fetchPlaceReviews as jest.Mock).mockResolvedValue([
      {
        id: "remote-review-1",
        placeId: "fallback-1",
        placeName: "Centro - Plaza Patria",
        rating: 5,
        comment: "Excelente ubicación y maniobra sencilla.",
        createdAt: "2026-03-18T18:10:00.000Z",
        updatedAt: "2026-03-18T18:15:00.000Z",
        reviewerUserId: "user-2",
        reviewerDisplayName: "Grace Hopper",
        source: "remote",
      },
    ]);
    (fetchSavedPlaceIds as jest.Mock).mockResolvedValue(["fallback-1", "fallback-2"]);
    (toggleSavedPlaceForUser as jest.Mock).mockResolvedValue({
      saved: true,
      placeIds: ["fallback-1", "fallback-2"],
    });

    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: "granted",
    });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
      coords: {
        latitude: 21.88234,
        longitude: -102.28259,
      },
    });

    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  it("renders the loaded place and opens search results", async () => {
    const screen = renderMapScreen();

    await waitFor(() => {
      expect(screen.getByText("Centro - Plaza Patria")).toBeTruthy();
    });

    fireEvent.press(screen.getByText("Buscar estacionamiento"));

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText("Buscar zona, plaza o estacionamiento")
      ).toBeTruthy();
    });

    fireEvent.changeText(
      screen.getByPlaceholderText("Buscar zona, plaza o estacionamiento"),
      "Feria"
    );

    await waitFor(() => {
      expect(screen.getByText("Zona Feria - Estadio")).toBeTruthy();
    });
  });

  it("refreshes map data from the floating button", async () => {
    (fetchRecentReports as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: "remote-report-1",
          placeId: "fallback-2",
          placeName: "Historial remoto",
          status: "full",
          note: "Muy saturado",
          createdAt: "2026-03-19T18:10:00.000Z",
          expiresAt: "2026-03-19T18:40:00.000Z",
          reportedDistanceMeters: 18,
          reporterUserId: null,
          reporterDisplayName: "Comunidad",
          source: "remote",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "remote-report-2",
          placeId: "fallback-1",
          placeName: "Historial actualizado",
          status: "available",
          note: "Espacios libres de nuevo",
          createdAt: "2026-03-19T18:22:00.000Z",
          expiresAt: "2026-03-19T18:52:00.000Z",
          reportedDistanceMeters: 9,
          reporterUserId: null,
          reporterDisplayName: "Comunidad",
          source: "remote",
        },
      ]);

    const screen = renderMapScreen();

    await waitFor(() => {
      expect(screen.getByText("Centro - Plaza Patria")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("refresh-map-button"));

    await waitFor(() => {
      expect(fetchPlaces).toHaveBeenCalledTimes(2);
      expect(fetchRecentReports).toHaveBeenCalledTimes(2);
    });

    fireEvent.press(screen.getByTestId("open-menu-button"));

    await waitFor(() => {
      expect(screen.getByText("Historial actualizado")).toBeTruthy();
    });
  });

  it("opens the menu shell and shows recent report history", async () => {
    const screen = renderMapScreen();

    await waitFor(() => {
      expect(screen.getByText("Centro - Plaza Patria")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("open-menu-button"));

    await waitFor(() => {
      expect(screen.getByText("Ada Lovelace")).toBeTruthy();
      expect(screen.getByText(/ada@example\.com/)).toBeTruthy();
      expect(screen.getByText("Historial de reportes")).toBeTruthy();
      expect(screen.getByText("Lugares guardados")).toBeTruthy();
      expect(screen.getByText("Historial remoto")).toBeTruthy();
    });
  });

  it("opens privacy and legal from the menu", async () => {
    const onOpenPrivacyLegal = jest.fn();
    const screen = renderMapScreen({ onOpenPrivacyLegal });

    await waitFor(() => {
      expect(screen.getByText("Centro - Plaza Patria")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("open-menu-button"));

    await waitFor(() => {
      expect(screen.getByText("Privacidad y legal")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("open-privacy-legal-button"));

    expect(onOpenPrivacyLegal).toHaveBeenCalledTimes(1);
  });

  it("opens report history from the menu", async () => {
    const onOpenReportHistory = jest.fn();
    const screen = renderMapScreen({ onOpenReportHistory });

    await waitFor(() => {
      expect(screen.getByText("Centro - Plaza Patria")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("open-menu-button"));

    await waitFor(() => {
      expect(screen.getByTestId("open-report-history-button")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("open-report-history-button"));

    expect(onOpenReportHistory).toHaveBeenCalledTimes(1);
  });

  it("opens saved places from the menu", async () => {
    const onOpenSavedPlaces = jest.fn();
    const screen = renderMapScreen({ onOpenSavedPlaces });

    await waitFor(() => {
      expect(screen.getByText("Centro - Plaza Patria")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("open-menu-button"));

    await waitFor(() => {
      expect(screen.getByTestId("open-saved-places-button")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("open-saved-places-button"));

    expect(onOpenSavedPlaces).toHaveBeenCalledTimes(1);
  });

  it("opens profile settings from the menu", async () => {
    const onOpenProfileSettings = jest.fn();
    const screen = renderMapScreen({ onOpenProfileSettings });

    await waitFor(() => {
      expect(screen.getByText("Centro - Plaza Patria")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("open-menu-button"));

    await waitFor(() => {
      expect(screen.getByTestId("open-profile-settings-button")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("open-profile-settings-button"));

    expect(onOpenProfileSettings).toHaveBeenCalledTimes(1);
  });

  it("opens report validation options from the place sheet", async () => {
    const screen = renderMapScreen();

    await waitFor(() => {
      expect(screen.getByText("Centro - Plaza Patria")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("validate-place-button"));

    await waitFor(() => {
      expect(screen.getByText("Reportar estado")).toBeTruthy();
      expect(screen.getByTestId("report-status-available")).toBeTruthy();
      expect(screen.getByTestId("report-status-full")).toBeTruthy();
      expect(screen.getByTestId("report-status-closed")).toBeTruthy();
    });
  });

  it("opens the review composer from the place detail action", async () => {
    const onOpenPlaceReview = jest.fn();
    const screen = renderMapScreen({ onOpenPlaceReview });

    await waitFor(() => {
      expect(screen.getByText("Centro - Plaza Patria")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("open-place-review-button"));

    expect(onOpenPlaceReview).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "fallback-1",
        name: "Centro - Plaza Patria",
      })
    );
  });

  it("opens the reviews modal from the rating tile", async () => {
    const screen = renderMapScreen();

    await waitFor(() => {
      expect(screen.getByText("Centro - Plaza Patria")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("open-place-reviews-button"));

    await waitFor(() => {
      expect(screen.getByText("Reseñas")).toBeTruthy();
      expect(screen.getByText("Grace Hopper")).toBeTruthy();
      expect(screen.getByText("Excelente ubicación y maniobra sencilla.")).toBeTruthy();
    });
  });

  it("submits a nearby report and shows confirmation", async () => {
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
      coords: {
        latitude: 21.88175,
        longitude: -102.29605,
      },
    });

    const screen = renderMapScreen();

    await waitFor(() => {
      expect(screen.getByText("Centro - Plaza Patria")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("validate-place-button"));

    await waitFor(() => {
      expect(screen.getByText("Reportar estado")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("report-status-available"));
    });

    expect(submitParkingReport).toHaveBeenCalledWith(
      expect.objectContaining({
        placeId: "fallback-1",
        placeName: "Centro - Plaza Patria",
        status: "available",
      })
    );
    expect(Alert.alert).toHaveBeenCalledWith(
      "Reporte enviado",
      expect.stringContaining("Centro - Plaza Patria")
    );
  });

  it("reacts to a recent report from the place history", async () => {
    const screen = renderMapScreen();

    await waitFor(() => {
      expect(screen.getByText("Centro - Plaza Patria")).toBeTruthy();
    });

    const confirmButton = await screen.findByTestId(
      "confirm-report-remote-place-report-1"
    );

    await act(async () => {
      fireEvent.press(confirmButton);
    });

    expect(reactToParkingReport).toHaveBeenCalledWith({
      reportId: "remote-place-report-1",
      reaction: "confirm",
    });
  });

  it("creates a parking place and persists it through the API", async () => {
    const screen = renderMapScreen();

    await waitFor(() => {
      expect(screen.getByText("Centro - Plaza Patria")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("toggle-add-place-button"));

    await waitFor(() => {
      expect(screen.getByText("Agregar estacionamiento")).toBeTruthy();
    });

    fireEvent.changeText(
      screen.getByTestId("new-place-name-input"),
      "Nuevo estacionamiento"
    );
    fireEvent.changeText(screen.getByTestId("new-place-monday-open-input"), "08:00");
    fireEvent.changeText(screen.getByTestId("new-place-monday-close-input"), "20:00");
    fireEvent.press(screen.getByTestId("new-place-sunday-closed-toggle"));

    await act(async () => {
      fireEvent.press(screen.getByText("Guardar lugar"));
    });

    expect(createParkingPlace).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Nuevo estacionamiento",
        openingHours: expect.objectContaining({
          monday: "08:00",
          sunday: null,
        }),
        closingHours: expect.objectContaining({
          monday: "20:00",
          sunday: null,
        }),
      })
    );
    expect(Alert.alert).toHaveBeenCalledWith(
      "Estacionamiento guardado",
      expect.stringContaining("Nuevo estacionamiento")
    );
  });

  it("closes the add parking sheet when dragged down", async () => {
    const screen = renderMapScreen();

    await waitFor(() => {
      expect(screen.getByText("Centro - Plaza Patria")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("toggle-add-place-button"));

    await waitFor(() => {
      expect(screen.getByText("Agregar estacionamiento")).toBeTruthy();
    });

    act(() => {
      screen.UNSAFE_getByType(BottomSheet).props.onChange(-1);
    });

    await waitFor(() => {
      expect(screen.queryByText("Agregar estacionamiento")).toBeNull();
      expect(
        screen.getByText("Toca un marcador para abrir la ficha completa o usa + para agregar uno nuevo.")
      ).toBeTruthy();
    });
  });

  it("toggles the saved state of the selected place", async () => {
    (fetchSavedPlaceIds as jest.Mock).mockResolvedValue([]);
    (toggleSavedPlaceForUser as jest.Mock).mockResolvedValue({
      saved: true,
      placeIds: ["fallback-1"],
    });

    const screen = renderMapScreen();

    await waitFor(() => {
      expect(screen.getByText("Centro - Plaza Patria")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("toggle-save-place-button"));
    });

    expect(toggleSavedPlaceForUser).toHaveBeenCalledWith("user-1", "fallback-1");
    expect(Alert.alert).toHaveBeenCalledWith(
      "Lugar guardado",
      expect.stringContaining("Centro - Plaza Patria")
    );
  });

  it("allows the user to sign out from the menu", async () => {
    const onSignOut = jest.fn();
    const screen = renderMapScreen({ onSignOut });

    await waitFor(() => {
      expect(screen.getByText("Centro - Plaza Patria")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("open-menu-button"));

    await waitFor(() => {
      expect(screen.getByTestId("sign-out-button")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByTestId("sign-out-button"));
    });

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
