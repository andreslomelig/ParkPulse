import { fetchPlaceReviews } from "./reviews";
import { getSupabaseClient } from "./supabase";

jest.mock("./supabase", () => ({
  getSupabaseClient: jest.fn(),
}));

describe("reviews", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns fallback reviews when supabase is unavailable", async () => {
    (getSupabaseClient as jest.Mock).mockReturnValue(null);

    const reviews = await fetchPlaceReviews("fallback-1");

    expect(reviews).toHaveLength(2);
    expect(reviews[0]).toEqual(
      expect.objectContaining({
        placeId: "fallback-1",
        rating: 5,
        source: "fallback",
      })
    );
  });

  it("maps remote reviews from the review feed", async () => {
    const limit = jest.fn().mockResolvedValue({
      data: [
        {
          id: "review-1",
          place_id: "place-1",
          place_name: "Altaria Mall",
          rating: "4",
          comment: "Amplio y comodo",
          created_at: "2026-03-19T18:00:00.000Z",
          updated_at: "2026-03-19T18:05:00.000Z",
          reviewer_user_id: "user-2",
          reviewer_display_name: "Grace Hopper",
        },
      ],
      error: null,
    });
    const order = jest.fn(() => ({ limit }));
    const eq = jest.fn(() => ({ order }));
    const select = jest.fn(() => ({ eq }));
    const client = {
      from: jest.fn(() => ({ select })),
    };

    (getSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(fetchPlaceReviews("place-1")).resolves.toEqual([
      {
        id: "review-1",
        placeId: "place-1",
        placeName: "Altaria Mall",
        rating: 4,
        comment: "Amplio y comodo",
        createdAt: "2026-03-19T18:00:00.000Z",
        updatedAt: "2026-03-19T18:05:00.000Z",
        reviewerUserId: "user-2",
        reviewerDisplayName: "Grace Hopper",
        source: "remote",
      },
    ]);
  });

  it("returns an empty list when the review feed fails", async () => {
    const limit = jest.fn().mockResolvedValue({
      data: null,
      error: { message: "review feed failed" },
    });
    const order = jest.fn(() => ({ limit }));
    const eq = jest.fn(() => ({ order }));
    const select = jest.fn(() => ({ eq }));
    const client = {
      from: jest.fn(() => ({ select })),
    };

    (getSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(fetchPlaceReviews("place-1")).resolves.toEqual([]);
  });

  it("returns an empty list for blank place ids", async () => {
    await expect(fetchPlaceReviews(" ")).resolves.toEqual([]);
  });
});
