import React from "react";
import { Alert } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import SavedPlacesScreen from "./SavedPlacesScreen";
import { fetchPlaces } from "../lib/places";
import { fetchSavedPlaceIds, removeSavedPlaceForUser } from "../lib/savedPlaces";

jest.mock("../lib/places", () => ({
  fetchPlaces: jest.fn(),
}));

jest.mock("../lib/savedPlaces", () => ({
  fetchSavedPlaceIds: jest.fn(),
  removeSavedPlaceForUser: jest.fn(),
  mapSavedPlaces: jest.requireActual("../lib/savedPlaces").mapSavedPlaces,
}));

const currentUser = {
  id: "user-1",
  email: "ada@example.com",
  fullName: "Ada Lovelace",
  phone: "+52 449 123 4567",
};

describe("SavedPlacesScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});

    (fetchPlaces as jest.Mock).mockResolvedValue([
      {
        id: "place-1",
        name: "Centro - Plaza Patria",
        description: "Estacionamiento central",
        address: "Centro",
        latitude: 21.8817,
        longitude: -102.2961,
        status: "available",
        updatedAt: "2026-03-19T18:10:00.000Z",
        lastReportedAt: "2026-03-19T18:10:00.000Z",
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
        id: "place-2",
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
    ]);
  });

  it("loads the signed-in user's saved places", async () => {
    (fetchSavedPlaceIds as jest.Mock).mockResolvedValue(["place-2", "place-1"]);

    const screen = render(<SavedPlacesScreen currentUser={currentUser} />);

    await waitFor(() => {
      expect(fetchSavedPlaceIds).toHaveBeenCalledWith("user-1");
      expect(fetchPlaces).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByText("Zona Feria - Estadio")).toBeTruthy();
      expect(screen.getByText("Centro - Plaza Patria")).toBeTruthy();
      expect(screen.getByText("Guardados")).toBeTruthy();
    });
  });

  it("shows an empty state when the user has no saved places", async () => {
    (fetchSavedPlaceIds as jest.Mock).mockResolvedValue([]);

    const screen = render(<SavedPlacesScreen currentUser={currentUser} />);

    await waitFor(() => {
      expect(screen.getByText("Todavia no tienes lugares guardados.")).toBeTruthy();
    });
  });

  it("opens a saved place in the map flow", async () => {
    (fetchSavedPlaceIds as jest.Mock).mockResolvedValue(["place-1"]);
    const onOpenPlace = jest.fn();

    const screen = render(
      <SavedPlacesScreen currentUser={currentUser} onOpenPlace={onOpenPlace} />
    );

    await waitFor(() => {
      expect(screen.getByTestId("saved-place-open-place-1")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("saved-place-open-place-1"));

    expect(onOpenPlace).toHaveBeenCalledWith("place-1");
  });

  it("removes a place from the saved list", async () => {
    (fetchSavedPlaceIds as jest.Mock).mockResolvedValue(["place-1"]);
    (removeSavedPlaceForUser as jest.Mock).mockResolvedValue([]);

    const screen = render(<SavedPlacesScreen currentUser={currentUser} />);

    await waitFor(() => {
      expect(screen.getByTestId("saved-place-remove-place-1")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("saved-place-remove-place-1"));

    await waitFor(() => {
      expect(removeSavedPlaceForUser).toHaveBeenCalledWith("user-1", "place-1");
      expect(screen.getByText("Todavia no tienes lugares guardados.")).toBeTruthy();
    });
  });
});
