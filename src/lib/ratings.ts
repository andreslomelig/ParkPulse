import { getCommunitySessionId } from "./communitySession";
import {
  normalizeRatingValue,
  toTrimmedString,
  type ParkingRatingSummary,
} from "./parkingShared";
import { requireSupabaseClient } from "./supabase";

export type { ParkingRatingSummary } from "./parkingShared";

export type SubmitParkingRatingInput = {
  placeId: string;
  rating: number;
  comment?: string | null;
  raterSessionId?: string | null;
};

type RawParkingRatingSummary = {
  place_id?: string | null;
  average_rating?: number | string | null;
  rating_count?: number | string | null;
  my_rating?: number | string | null;
};

export function normalizeSubmitParkingRatingInput(
  input: SubmitParkingRatingInput
) {
  const placeId = toTrimmedString(input.placeId);
  const rating = normalizeRatingValue(input.rating);

  if (!placeId) {
    throw new Error("La calificación necesita un estacionamiento válido.");
  }

  if (rating === null) {
    throw new Error("La calificación debe estar entre 1 y 5.");
  }

  return {
    placeId,
    rating,
    comment: toTrimmedString(input.comment),
    raterSessionId:
      toTrimmedString(input.raterSessionId) ?? getCommunitySessionId(),
  };
}

function mapRawParkingRatingSummary(
  summary: RawParkingRatingSummary
): ParkingRatingSummary | null {
  const placeId = toTrimmedString(summary.place_id);
  const myRating =
    summary.my_rating === null || summary.my_rating === undefined
      ? null
      : Number(summary.my_rating);

  if (!placeId || myRating === null || !Number.isFinite(myRating)) {
    return null;
  }

  const averageRating =
    summary.average_rating === null || summary.average_rating === undefined
      ? null
      : Number(summary.average_rating);
  const ratingCount =
    summary.rating_count === null || summary.rating_count === undefined
      ? 0
      : Math.trunc(Number(summary.rating_count));

  return {
    placeId,
    averageRating:
      averageRating === null || !Number.isFinite(averageRating)
        ? null
        : averageRating,
    ratingCount: Number.isFinite(ratingCount) ? ratingCount : 0,
    myRating: Math.trunc(myRating),
    source: "remote",
  };
}

export async function submitParkingRating(
  input: SubmitParkingRatingInput
): Promise<ParkingRatingSummary> {
  const normalizedInput = normalizeSubmitParkingRatingInput(input);
  const client = requireSupabaseClient();

  const { data, error } = await client.rpc("upsert_place_rating", {
    input_place_id: normalizedInput.placeId,
    input_rating: normalizedInput.rating,
    input_comment: normalizedInput.comment,
    input_rater_session_id: normalizedInput.raterSessionId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const summary = Array.isArray(data) ? data[0] : data;
  const mappedSummary = mapRawParkingRatingSummary(
    (summary as RawParkingRatingSummary | null) ?? {}
  );

  if (!mappedSummary) {
    throw new Error("No se pudo interpretar la calificación del estacionamiento.");
  }

  return mappedSummary;
}
