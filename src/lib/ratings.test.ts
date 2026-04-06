import {
  normalizeSubmitParkingRatingInput,
  submitParkingRating,
} from "./ratings";
import { requireSupabaseClient } from "./supabase";

jest.mock("./communitySession", () => ({
  getCommunitySessionId: jest.fn(() => "session-123"),
}));

jest.mock("./supabase", () => ({
  requireSupabaseClient: jest.fn(),
}));

describe("ratings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("normalizes and validates rating payloads", () => {
    expect(
      normalizeSubmitParkingRatingInput({
        placeId: " place-1 ",
        rating: 4.4,
        comment: "  Bien  ",
      })
    ).toEqual({
      placeId: "place-1",
      rating: 4,
      comment: "Bien",
      raterSessionId: "session-123",
    });

    expect(() =>
      normalizeSubmitParkingRatingInput({
        placeId: "",
        rating: 5,
      })
    ).toThrow("La calificacion necesita un estacionamiento valido.");

    expect(() =>
      normalizeSubmitParkingRatingInput({
        placeId: "place-1",
        rating: 0,
      })
    ).toThrow("La calificacion debe estar entre 1 y 5.");
  });

  it("sends ratings to the rpc endpoint", async () => {
    const client = {
      rpc: jest.fn().mockResolvedValue({
        data: [
          {
            place_id: "place-1",
            average_rating: "4.67",
            rating_count: "3",
            my_rating: 5,
          },
        ],
        error: null,
      }),
    };

    (requireSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(
      submitParkingRating({
        placeId: "place-1",
        rating: 5,
      })
    ).resolves.toEqual({
      placeId: "place-1",
      averageRating: 4.67,
      ratingCount: 3,
      myRating: 5,
      source: "remote",
    });
  });

  it("accepts non-array rpc payloads and normalizes invalid aggregates", async () => {
    const client = {
      rpc: jest.fn().mockResolvedValue({
        data: {
          place_id: "place-1",
          average_rating: "nan",
          rating_count: "nan",
          my_rating: "4",
        },
        error: null,
      }),
    };

    (requireSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(
      submitParkingRating({
        placeId: "place-1",
        rating: 4,
      })
    ).resolves.toEqual({
      placeId: "place-1",
      averageRating: null,
      ratingCount: 0,
      myRating: 4,
      source: "remote",
    });
  });

  it("handles null aggregate fields from the rpc response", async () => {
    const client = {
      rpc: jest.fn().mockResolvedValue({
        data: {
          place_id: "place-1",
          average_rating: null,
          rating_count: null,
          my_rating: 4,
        },
        error: null,
      }),
    };

    (requireSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(
      submitParkingRating({
        placeId: "place-1",
        rating: 4,
      })
    ).resolves.toEqual({
      placeId: "place-1",
      averageRating: null,
      ratingCount: 0,
      myRating: 4,
      source: "remote",
    });
  });

  it("throws a parsing error when the rating rpc returns no usable row", async () => {
    const client = {
      rpc: jest.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    };

    (requireSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(
      submitParkingRating({
        placeId: "place-1",
        rating: 4,
      })
    ).rejects.toThrow("No se pudo interpretar la calificacion del estacionamiento.");
  });

  it("surfaces rpc and parsing errors when rating a place", async () => {
    const errorClient = {
      rpc: jest.fn().mockResolvedValue({
        data: null,
        error: { message: "rating failed" },
      }),
    };
    const malformedClient = {
      rpc: jest.fn().mockResolvedValue({
        data: [{ place_id: "place-1" }],
        error: null,
      }),
    };

    (requireSupabaseClient as jest.Mock).mockReturnValue(errorClient);
    await expect(
      submitParkingRating({
        placeId: "place-1",
        rating: 5,
      })
    ).rejects.toThrow("rating failed");

    (requireSupabaseClient as jest.Mock).mockReturnValue(malformedClient);
    await expect(
      submitParkingRating({
        placeId: "place-1",
        rating: 5,
      })
    ).rejects.toThrow("No se pudo interpretar la calificacion del estacionamiento.");
  });
});
