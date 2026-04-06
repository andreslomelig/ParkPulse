import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ParkingPlace } from "./parkingShared";
import {
  fetchSavedPlaceIds,
  mapSavedPlaces,
  removeSavedPlaceForUser,
  savePlaceForUser,
  toggleSavedPlaceForUser,
} from "./savedPlaces";

const STORAGE_KEY = "parkpulse:saved-places:user-1";

const places: ParkingPlace[] = [
  {
    id: "place-1",
    name: "Centro - Plaza Patria",
    description: null,
    address: "Centro",
    latitude: 21.88,
    longitude: -102.29,
    status: "available",
    updatedAt: null,
    lastReportedAt: null,
    activeReportCount: 0,
    totalReportCount: 0,
    averageRating: 4.2,
    ratingCount: 12,
    costType: "paid",
    currencyCode: "MXN",
    hourlyCostMin: 20,
    hourlyCostMax: 30,
    costNotes: null,
    capacityMin: 50,
    capacityMax: 80,
    capacityConfidence: "range",
    accessType: "public",
    source: "remote",
  },
  {
    id: "place-2",
    name: "Zona Feria - Estadio",
    description: null,
    address: "Zona Feria",
    latitude: 21.87,
    longitude: -102.3,
    status: "full",
    updatedAt: null,
    lastReportedAt: null,
    activeReportCount: 0,
    totalReportCount: 0,
    averageRating: 3.5,
    ratingCount: 7,
    costType: "paid",
    currencyCode: "MXN",
    hourlyCostMin: 25,
    hourlyCostMax: 35,
    costNotes: null,
    capacityMin: 90,
    capacityMax: 140,
    capacityConfidence: "estimated",
    accessType: "public",
    source: "remote",
  },
];

describe("savedPlaces", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it("returns an empty list when the user has no saved places yet", async () => {
    await expect(fetchSavedPlaceIds("user-1")).resolves.toEqual([]);
  });

  it("stores saved places in recency order without duplicates", async () => {
    await savePlaceForUser("user-1", "place-1");
    await savePlaceForUser("user-1", "place-2");
    await savePlaceForUser("user-1", "place-1");

    await expect(fetchSavedPlaceIds("user-1")).resolves.toEqual(["place-1", "place-2"]);
  });

  it("removes a saved place without touching the others", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(["place-1", "place-2"]));

    await expect(removeSavedPlaceForUser("user-1", "place-1")).resolves.toEqual([
      "place-2",
    ]);
    await expect(fetchSavedPlaceIds("user-1")).resolves.toEqual(["place-2"]);
  });

  it("toggles the saved status of a place", async () => {
    await expect(toggleSavedPlaceForUser("user-1", "place-1")).resolves.toEqual({
      saved: true,
      placeIds: ["place-1"],
    });

    await expect(toggleSavedPlaceForUser("user-1", "place-1")).resolves.toEqual({
      saved: false,
      placeIds: [],
    });
  });

  it("ignores malformed or duplicated storage payloads", async () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([" place-2 ", "place-1", "place-2", "", null])
    );
    await expect(fetchSavedPlaceIds("user-1")).resolves.toEqual(["place-2", "place-1"]);

    await AsyncStorage.setItem(STORAGE_KEY, "{broken");
    await expect(fetchSavedPlaceIds("user-1")).resolves.toEqual([]);

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });

  it("maps the saved places using the user's save order", () => {
    expect(mapSavedPlaces(places, ["missing-place", "place-2", "place-1"])).toEqual([
      places[1],
      places[0],
    ]);
  });
});
