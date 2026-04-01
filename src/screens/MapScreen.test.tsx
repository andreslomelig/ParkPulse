import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import * as Location from "expo-location";
import MapScreen from "./MapScreen";
import { fetchPlaces } from "../lib/places";
import { fetchRecentReports, submitParkingReport } from "../lib/reports";

jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 1 },
}));

jest.mock("../lib/places", () => ({
  fetchPlaces: jest.fn(),
}));

jest.mock("../lib/reports", () => ({
  fetchRecentReports: jest.fn(),
  submitParkingReport: jest.fn(),
}));

describe("MapScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (fetchPlaces as jest.Mock).mockResolvedValue([
      {
        id: "fallback-1",
        name: "Centro - Plaza Patria",
        latitude: 21.8817,
        longitude: -102.2961,
        status: "available",
        updatedAt: "2026-03-19T18:00:00.000Z",
        source: "fallback",
      },
      {
        id: "fallback-2",
        name: "Zona Feria - Estadio",
        latitude: 21.8728,
        longitude: -102.3091,
        status: "full",
        updatedAt: "2026-03-19T17:40:00.000Z",
        source: "fallback",
      },
    ]);

    (fetchRecentReports as jest.Mock).mockResolvedValue([
      {
        id: "remote-report-1",
        placeId: "fallback-2",
        placeName: "Historial remoto",
        status: "full",
        createdAt: "2026-03-19T18:10:00.000Z",
        expiresAt: "2026-03-19T18:40:00.000Z",
        source: "remote",
      },
    ]);

    (submitParkingReport as jest.Mock).mockResolvedValue({
      id: "remote-report-2",
      placeId: "fallback-1",
      placeName: "Centro - Plaza Patria",
      status: "available",
      createdAt: "2026-03-19T18:12:00.000Z",
      expiresAt: "2026-03-19T18:27:00.000Z",
      source: "remote",
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
    const screen = render(<MapScreen />);

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

  it("opens the menu shell and shows recent report history", async () => {
    const screen = render(<MapScreen />);

    await waitFor(() => {
      expect(screen.getByText("Centro - Plaza Patria")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("open-menu-button"));

    await waitFor(() => {
      expect(screen.getByText("Invitado")).toBeTruthy();
      expect(screen.getByText("Historial de reportes")).toBeTruthy();
      expect(screen.getByText("Lugares guardados")).toBeTruthy();
      expect(screen.getByText("Historial remoto")).toBeTruthy();
    });
  });

  it("opens privacy and legal from the menu", async () => {
    const onOpenPrivacyLegal = jest.fn();
    const screen = render(<MapScreen onOpenPrivacyLegal={onOpenPrivacyLegal} />);

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

  it("opens report validation options from the place sheet", async () => {
    const screen = render(<MapScreen />);

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

  it("submits a nearby report and shows confirmation", async () => {
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
      coords: {
        latitude: 21.88175,
        longitude: -102.29605,
      },
    });

    const screen = render(<MapScreen />);

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
});
