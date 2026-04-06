import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import PlaceReviewScreen from "./PlaceReviewScreen";
import type { AuthenticatedAppUser } from "../lib/auth";
import { fetchPlaceById } from "../lib/places";
import { submitParkingRating } from "../lib/ratings";

jest.mock("../lib/places", () => ({
  fetchPlaceById: jest.fn(),
}));

jest.mock("../lib/ratings", () => ({
  submitParkingRating: jest.fn(),
}));

const currentUser: AuthenticatedAppUser = {
  id: "user-1",
  email: "ada@example.com",
  fullName: "Ada Lovelace",
  phone: "+52 449 123 4567",
};

describe("PlaceReviewScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (fetchPlaceById as jest.Mock).mockResolvedValue({
      id: "place-1",
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
    });
    (submitParkingRating as jest.Mock).mockResolvedValue({
      placeId: "place-1",
      averageRating: 4.3,
      ratingCount: 11,
      myRating: 5,
      source: "remote",
    });

    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  it("submits a review with stars and comment", async () => {
    const onReviewSaved = jest.fn();
    const screen = render(
      <PlaceReviewScreen
        currentUser={currentUser}
        placeId="place-1"
        placeName="Centro - Plaza Patria"
        onCancel={jest.fn()}
        onReviewSaved={onReviewSaved}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Centro - Plaza Patria")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("review-star-5"));
    fireEvent.changeText(
      screen.getByTestId("review-comment-input"),
      "Muy ordenado y facil para salir."
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId("publish-review-button"));
    });

    expect(submitParkingRating).toHaveBeenCalledWith({
      placeId: "place-1",
      rating: 5,
      comment: "Muy ordenado y facil para salir.",
    });
    expect(onReviewSaved).toHaveBeenCalledWith("place-1");
    expect(Alert.alert).toHaveBeenCalledWith(
      "Reseña publicada",
      expect.stringContaining("Centro - Plaza Patria")
    );
  });

  it("cancels through the provided callback", async () => {
    const onCancel = jest.fn();
    const screen = render(
      <PlaceReviewScreen
        currentUser={currentUser}
        placeId="place-1"
        placeName="Centro - Plaza Patria"
        onCancel={onCancel}
        onReviewSaved={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Centro - Plaza Patria")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("cancel-review-button"));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
