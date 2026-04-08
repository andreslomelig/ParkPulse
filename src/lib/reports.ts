import { getCommunitySessionId } from "./communitySession";
import {
  clampLimit,
  normalizeParkingReportReaction,
  normalizeParkingReportStatus,
  normalizeRatingValue,
  toInteger,
  toNumber,
  toTrimmedString,
  type ParkingReport,
  type ParkingReportReaction,
  type ParkingReportStatus,
} from "./parkingShared";
import { getSupabaseClient, requireSupabaseClient } from "./supabase";

export type {
  ParkingReport,
  ParkingReportReaction,
  ParkingReportStatus,
  ParkingStatus,
} from "./parkingShared";

export type SubmitParkingReportInput = {
  placeId: string;
  placeName: string;
  status: ParkingReportStatus;
  note?: string | null;
  reporterSessionId?: string | null;
  reportedLatitude?: number | null;
  reportedLongitude?: number | null;
  reportedDistanceMeters?: number | null;
  rating?: number | null;
};

export type ReactToParkingReportInput = {
  reportId: string;
  reaction: ParkingReportReaction;
  actorSessionId?: string | null;
};

type RawParkingReport = {
  id?: string | number | null;
  place_id?: string | number | null;
  place_name?: string | null;
  status?: string | null;
  report_status?: string | null;
  note?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
  reported_distance_meters?: number | string | null;
  reporter_user_id?: string | null;
  reporter_display_name?: string | null;
  confirm_count?: number | string | null;
  dispute_count?: number | string | null;
};

type ReportFeedScope =
  | {
      column: "place_id" | "reporter_user_id";
      value: string;
    }
  | null;

const REPORT_SELECT = [
  "id",
  "place_id",
  "place_name",
  "status",
  "note",
  "created_at",
  "expires_at",
  "reported_distance_meters",
  "reporter_user_id",
  "reporter_display_name",
  "confirm_count",
  "dispute_count",
].join(", ");

const LEGACY_REPORT_SELECT = [
  "id",
  "place_id",
  "place_name",
  "status",
  "note",
  "created_at",
  "expires_at",
  "reported_distance_meters",
  "reporter_user_id",
].join(", ");

const fallbackRecentReports: ParkingReport[] = [
  {
    id: "report-1",
    placeId: "fallback-1",
    placeName: "Plaza Patria",
    status: "available",
    note: "Movimiento constante; aún hay lugares disponibles.",
    createdAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 7 * 60 * 1000).toISOString(),
    reportedDistanceMeters: 30,
    reporterUserId: null,
    reporterDisplayName: "Comunidad",
    confirmCount: 1,
    disputeCount: 0,
    source: "fallback",
  },
  {
    id: "report-2",
    placeId: "fallback-2",
    placeName: "Estadio Victoria",
    status: "full",
    note: "Se llenó por un evento esta tarde.",
    createdAt: new Date(Date.now() - 21 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 9 * 60 * 1000).toISOString(),
    reportedDistanceMeters: 42,
    reporterUserId: null,
    reporterDisplayName: "Comunidad",
    confirmCount: 0,
    disputeCount: 1,
    source: "fallback",
  },
];

function isMissingSchemaFieldError(message: string) {
  return message.includes("does not exist");
}

export function normalizeSubmitParkingReportInput(
  input: SubmitParkingReportInput
) {
  const placeId = toTrimmedString(input.placeId);
  const placeName = toTrimmedString(input.placeName);
  const status = normalizeParkingReportStatus(input.status);
  const rating = normalizeRatingValue(input.rating);

  if (!placeId || !placeName) {
    throw new Error("El reporte necesita un estacionamiento válido.");
  }

  if (!status) {
    throw new Error("El estado del reporte es inválido.");
  }

  if (input.rating !== null && input.rating !== undefined && rating === null) {
    throw new Error("La calificación del reporte debe estar entre 1 y 5.");
  }

  return {
    placeId,
    placeName,
    status,
    note: toTrimmedString(input.note),
    reporterSessionId:
      toTrimmedString(input.reporterSessionId) ?? getCommunitySessionId(),
    reportedLatitude: toNumber(input.reportedLatitude),
    reportedLongitude: toNumber(input.reportedLongitude),
    reportedDistanceMeters: toInteger(input.reportedDistanceMeters),
    rating,
  };
}

export function normalizeReactToParkingReportInput(
  input: ReactToParkingReportInput
) {
  const reportId = toTrimmedString(input.reportId);
  const reaction = normalizeParkingReportReaction(input.reaction);

  if (!reportId) {
    throw new Error("La reacción necesita un reporte válido.");
  }

  if (!reaction) {
    throw new Error("La reacción del reporte es inválida.");
  }

  return {
    reportId,
    reaction,
    actorSessionId:
      toTrimmedString(input.actorSessionId) ?? getCommunitySessionId(),
  };
}

function mapReportRows(rows: RawParkingReport[] | null): ParkingReport[] {
  return (
    rows
      ?.map(mapRawReport)
      .filter((item): item is ParkingReport => item !== null) ?? []
  );
}

async function readReportFeed(
  client: NonNullable<ReturnType<typeof getSupabaseClient>>,
  limit: number,
  scope: ReportFeedScope,
  primaryErrorLabel: string,
  legacyErrorLabel: string
): Promise<ParkingReport[]> {
  const runSelect = async (selectClause: string) => {
    const baseQuery = client.from("place_report_feed").select(selectClause);
    const scopedQuery = scope ? baseQuery.eq(scope.column, scope.value) : baseQuery;

    return scopedQuery
      .order("created_at", { ascending: false })
      .limit(limit);
  };

  const result = await runSelect(REPORT_SELECT);

  if (result.error) {
    if (!isMissingSchemaFieldError(result.error.message)) {
      console.error(primaryErrorLabel, result.error.message);
      return [];
    }

    const legacyResult = await runSelect(LEGACY_REPORT_SELECT);
    if (legacyResult.error) {
      console.error(legacyErrorLabel, legacyResult.error.message);
      return [];
    }

    return mapReportRows((legacyResult.data as RawParkingReport[] | null) ?? null);
  }

  return mapReportRows((result.data as RawParkingReport[] | null) ?? null);
}

function mapRawReport(report: RawParkingReport): ParkingReport | null {
  const status = normalizeParkingReportStatus(report.status ?? report.report_status);
  if (!status) return null;

  const createdAt = report.created_at ?? new Date().toISOString();

  return {
    id: String(report.id ?? `report-${createdAt}`),
    placeId: String(report.place_id ?? "unknown-place"),
    placeName: toTrimmedString(report.place_name) ?? "Estacionamiento",
    status,
    note: toTrimmedString(report.note),
    createdAt,
    expiresAt: report.expires_at ?? null,
    reportedDistanceMeters: toInteger(report.reported_distance_meters),
    reporterUserId: report.reporter_user_id ?? null,
    reporterDisplayName: toTrimmedString(report.reporter_display_name),
    confirmCount: toInteger(report.confirm_count) ?? 0,
    disputeCount: toInteger(report.dispute_count) ?? 0,
    source: "remote",
  };
}

export async function fetchRecentReports(limit = 5): Promise<ParkingReport[]> {
  const client = getSupabaseClient();
  if (!client) return fallbackRecentReports.slice(0, clampLimit(limit, 5));

  return readReportFeed(
    client,
    clampLimit(limit, 5),
    null,
    "fetchRecentReports error:",
    "fetchRecentReports legacy error:"
  );
}

export async function fetchReportsForPlace(
  placeId: string,
  limit = 10
): Promise<ParkingReport[]> {
  const normalizedPlaceId = toTrimmedString(placeId);
  if (!normalizedPlaceId) return [];

  const client = getSupabaseClient();
  if (!client) {
    return fallbackRecentReports
      .filter((report) => report.placeId === normalizedPlaceId)
      .slice(0, clampLimit(limit, 10));
  }

  return readReportFeed(
    client,
    clampLimit(limit, 10),
    { column: "place_id", value: normalizedPlaceId },
    "fetchReportsForPlace error:",
    "fetchReportsForPlace legacy error:"
  );
}

export async function fetchReportsForUser(
  userId: string,
  limit = 25
): Promise<ParkingReport[]> {
  const normalizedUserId = toTrimmedString(userId);
  if (!normalizedUserId) return [];

  const client = getSupabaseClient();
  if (!client) {
    return fallbackRecentReports
      .filter((report) => report.reporterUserId === normalizedUserId)
      .slice(0, clampLimit(limit, 25));
  }

  return readReportFeed(
    client,
    clampLimit(limit, 25),
    { column: "reporter_user_id", value: normalizedUserId },
    "fetchReportsForUser error:",
    "fetchReportsForUser legacy error:"
  );
}

export async function submitParkingReport(
  input: SubmitParkingReportInput
): Promise<ParkingReport> {
  const normalizedInput = normalizeSubmitParkingReportInput(input);
  const client = requireSupabaseClient();

  const { data, error } = await client.rpc("create_place_report", {
    input_place_id: normalizedInput.placeId,
    input_report_status: normalizedInput.status,
    input_note: normalizedInput.note,
    input_reported_latitude: normalizedInput.reportedLatitude,
    input_reported_longitude: normalizedInput.reportedLongitude,
    input_reported_distance_meters: normalizedInput.reportedDistanceMeters,
    input_reporter_session_id: normalizedInput.reporterSessionId,
    input_rating: normalizedInput.rating,
  });

  if (error) {
    throw new Error(error.message);
  }

  const createdReport = Array.isArray(data) ? data[0] : data;
  const mappedReport = mapRawReport((createdReport as RawParkingReport | null) ?? {});

  if (!mappedReport) {
    throw new Error("No se pudo interpretar el reporte creado.");
  }

  return mappedReport;
}

export async function reactToParkingReport(
  input: ReactToParkingReportInput
): Promise<ParkingReport> {
  const normalizedInput = normalizeReactToParkingReportInput(input);
  const client = requireSupabaseClient();

  const { data, error } = await client.rpc("react_to_place_report", {
    input_report_id: normalizedInput.reportId,
    input_reaction: normalizedInput.reaction,
    input_actor_session_id: normalizedInput.actorSessionId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const updatedReport = Array.isArray(data) ? data[0] : data;
  const mappedReport = mapRawReport((updatedReport as RawParkingReport | null) ?? {});

  if (!mappedReport) {
    throw new Error("No se pudo interpretar la reaccion del reporte.");
  }

  return mappedReport;
}
