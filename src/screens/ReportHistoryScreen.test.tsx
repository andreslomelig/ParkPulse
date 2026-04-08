import React from "react";
import { Alert } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import ReportHistoryScreen from "./ReportHistoryScreen";
import { fetchReportsForUser } from "../lib/reports";

jest.mock("../lib/reports", () => ({
  fetchReportsForUser: jest.fn(),
}));

const currentUser = {
  id: "user-1",
  email: "ada@example.com",
  fullName: "Ada Lovelace",
  phone: "+52 449 123 4567",
  avatarUrl: null,
};

describe("ReportHistoryScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  it("loads the signed-in user's report history", async () => {
    (fetchReportsForUser as jest.Mock).mockResolvedValue([
      {
        id: "report-1",
        placeId: "place-1",
        placeName: "Centro - Plaza Patria",
        status: "available",
        note: "Habia varios cajones libres.",
        createdAt: "2026-03-19T18:10:00.000Z",
        expiresAt: "2026-03-19T18:25:00.000Z",
        reportedDistanceMeters: 18,
        reporterUserId: "user-1",
        reporterDisplayName: "Ada Lovelace",
        source: "remote",
      },
    ]);

    const screen = render(<ReportHistoryScreen currentUser={currentUser} />);

    await waitFor(() => {
      expect(fetchReportsForUser).toHaveBeenCalledWith("user-1", 25);
    });

    await waitFor(() => {
      expect(screen.getByText("Centro - Plaza Patria")).toBeTruthy();
      expect(screen.getByText("Habia varios cajones libres.")).toBeTruthy();
      expect(screen.getByText("Disponible")).toBeTruthy();
    });
  });

  it("shows an empty state when the user has no reports", async () => {
    (fetchReportsForUser as jest.Mock).mockResolvedValue([]);

    const screen = render(<ReportHistoryScreen currentUser={currentUser} />);

    await waitFor(() => {
      expect(screen.getByText("Todavía no has enviado reportes.")).toBeTruthy();
    });
  });

  it("refreshes the history on demand", async () => {
    (fetchReportsForUser as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "report-2",
          placeId: "place-2",
          placeName: "Zona Feria - Estadio",
          status: "full",
          note: null,
          createdAt: "2026-03-19T19:10:00.000Z",
          expiresAt: "2026-03-19T19:40:00.000Z",
          reportedDistanceMeters: 25,
          reporterUserId: "user-1",
          reporterDisplayName: "Ada Lovelace",
          source: "remote",
        },
      ]);

    const screen = render(<ReportHistoryScreen currentUser={currentUser} />);

    await waitFor(() => {
      expect(screen.getByText("Todavía no has enviado reportes.")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("report-history-refresh-button"));

    await waitFor(() => {
      expect(screen.getByText("Zona Feria - Estadio")).toBeTruthy();
    });
  });
});
