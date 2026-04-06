import { clampLimit, toInteger, toTrimmedString, type ParkingPlaceReview } from "./parkingShared";
import { getSupabaseClient } from "./supabase";

export type { ParkingPlaceReview } from "./parkingShared";

type RawParkingPlaceReview = {
  id?: string | number | null;
  place_id?: string | number | null;
  place_name?: string | null;
  rating?: number | string | null;
  comment?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  reviewer_user_id?: string | null;
  reviewer_display_name?: string | null;
};

const PLACE_REVIEW_SELECT = [
  "id",
  "place_id",
  "place_name",
  "rating",
  "comment",
  "created_at",
  "updated_at",
  "reviewer_user_id",
  "reviewer_display_name",
].join(", ");

const fallbackPlaceReviews: ParkingPlaceReview[] = [
  {
    id: "fallback-review-1",
    placeId: "fallback-1",
    placeName: "Plaza Patria",
    rating: 5,
    comment: "Bien ubicado para moverse por el centro y entrar rapido.",
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    reviewerUserId: null,
    reviewerDisplayName: "Comunidad",
    source: "fallback",
  },
  {
    id: "fallback-review-2",
    placeId: "fallback-1",
    placeName: "Plaza Patria",
    rating: 4,
    comment: "Buena opcion si vas temprano; por la tarde suele tardar mas la salida.",
    createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    reviewerUserId: null,
    reviewerDisplayName: "Comunidad",
    source: "fallback",
  },
];

function mapRawParkingPlaceReview(
  review: RawParkingPlaceReview
): ParkingPlaceReview | null {
  const placeId = toTrimmedString(
    review.place_id === undefined || review.place_id === null
      ? null
      : String(review.place_id)
  );
  const rating = toInteger(review.rating);
  const createdAt = toTrimmedString(review.created_at) ?? new Date().toISOString();

  if (!placeId || rating === null || rating < 1 || rating > 5) {
    return null;
  }

  return {
    id: String(review.id ?? `review-${placeId}-${createdAt}`),
    placeId,
    placeName: toTrimmedString(review.place_name) ?? "Estacionamiento",
    rating,
    comment: toTrimmedString(review.comment),
    createdAt,
    updatedAt: toTrimmedString(review.updated_at),
    reviewerUserId: toTrimmedString(review.reviewer_user_id),
    reviewerDisplayName: toTrimmedString(review.reviewer_display_name),
    source: "remote",
  };
}

function mapReviewRows(rows: RawParkingPlaceReview[] | null) {
  return (
    rows
      ?.map(mapRawParkingPlaceReview)
      .filter((item): item is ParkingPlaceReview => item !== null) ?? []
  );
}

export async function fetchPlaceReviews(
  placeId: string,
  limit = 25
): Promise<ParkingPlaceReview[]> {
  const normalizedPlaceId = toTrimmedString(placeId);
  if (!normalizedPlaceId) return [];

  const client = getSupabaseClient();
  if (!client) {
    return fallbackPlaceReviews
      .filter((review) => review.placeId === normalizedPlaceId)
      .slice(0, clampLimit(limit, 25));
  }

  const { data, error } = await client
    .from("place_review_feed")
    .select(PLACE_REVIEW_SELECT)
    .eq("place_id", normalizedPlaceId)
    .order("updated_at", { ascending: false })
    .limit(clampLimit(limit, 25));

  if (error) {
    console.error("fetchPlaceReviews error:", error.message);
    return [];
  }

  return mapReviewRows((data as RawParkingPlaceReview[] | null) ?? null);
}
