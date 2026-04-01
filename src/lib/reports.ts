import type { ParkingStatus } from "./places";
import { supabase } from "./supabase";

export type ParkingReportStatus = Exclude<ParkingStatus, "unknown">;

export type ParkingReport = {
  id: string;
  placeId: string;
  placeName: string;
  status: ParkingReportStatus;
  createdAt: string;
  expiresAt: string | null;
  source: "remote" | "fallback";
};

export type SubmitParkingReportInput = {
  placeId: string;
  placeName: string;
  status: ParkingReportStatus;
  reporterSessionId?: string | null;
  reportedLatitude?: number | null;
  reportedLongitude?: number | null;
  reportedDistanceMeters?: number | null;
};

type RawParkingReport = {
  id?: string | number | null;
  place_id?: string | number | null;
  place_name?: string | null;
  status?: string | null;
  report_status?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
};

const DEMO_REPORTER_SESSION_ID = "demo-session";

const fallbackRecentReports: ParkingReport[] = [
  {
    id: "report-1",
    placeId: "fallback-1",
    placeName: "Centro - Plaza Patria",
    status: "available",
    createdAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 7 * 60 * 1000).toISOString(),
    source: "fallback",
  },
  {
    id: "report-2",
    placeId: "fallback-2",
    placeName: "Zona Feria - Estadio",
    status: "full",
    createdAt: new Date(Date.now() - 21 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 9 * 60 * 1000).toISOString(),
    source: "fallback",
  },
];

function normalizeReportStatus(
  raw: string | null | undefined
): ParkingReportStatus | null {
  const value = raw?.trim().toLowerCase();
  if (value === "available" || value === "disponible") return "available";
  if (value === "full" || value === "lleno") return "full";
  if (value === "closed" || value === "cerrado") return "closed";
  return null;
}

function getReportTtlMinutes(status: ParkingReportStatus) {
  switch (status) {
    case "available":
      return 15;
    case "full":
      return 30;
    case "closed":
      return 12 * 60;
  }
}

function addMinutes(isoDate: string, minutes: number) {
  return new Date(new Date(isoDate).getTime() + minutes * 60 * 1000).toISOString();
}

function mapRawReport(report: RawParkingReport): ParkingReport | null {
  const status = normalizeReportStatus(report.status ?? report.report_status);
  if (!status) return null;

  const createdAt = report.created_at ?? new Date().toISOString();

  return {
    id: String(report.id ?? `report-${createdAt}`),
    placeId: String(report.place_id ?? "unknown-place"),
    placeName: report.place_name?.trim() || "Estacionamiento",
    status,
    createdAt,
    expiresAt: report.expires_at ?? null,
    source: "remote",
  };
}

export async function fetchRecentReports(limit = 5): Promise<ParkingReport[]> {
  if (!supabase) return fallbackRecentReports.slice(0, limit);

  const { data, error } = await supabase
    .from("place_report_feed")
    .select("id, place_id, place_name, status, created_at, expires_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("fetchRecentReports error:", error.message);
    return [];
  }

  return (
    (data as RawParkingReport[] | null)
      ?.map(mapRawReport)
      .filter((item): item is ParkingReport => item !== null) ?? []
  );
}

export async function fetchReportsForPlace(
  placeId: string,
  limit = 10
): Promise<ParkingReport[]> {
  if (!supabase) {
    return fallbackRecentReports
      .filter((report) => report.placeId === placeId)
      .slice(0, limit);
  }

  const { data, error } = await supabase
    .from("place_report_feed")
    .select("id, place_id, place_name, status, created_at, expires_at")
    .eq("place_id", placeId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("fetchReportsForPlace error:", error.message);
    return [];
  }

  return (
    (data as RawParkingReport[] | null)
      ?.map(mapRawReport)
      .filter((item): item is ParkingReport => item !== null) ?? []
  );
}

export async function submitParkingReport(
  input: SubmitParkingReportInput
): Promise<ParkingReport> {
  const createdAt = new Date().toISOString();
  const fallbackReport: ParkingReport = {
    id: `local-report-${Date.now()}`,
    placeId: input.placeId,
    placeName: input.placeName,
    status: input.status,
    createdAt,
    expiresAt: addMinutes(createdAt, getReportTtlMinutes(input.status)),
    source: "fallback",
  };

  if (!supabase) return fallbackReport;

  const { data, error } = await supabase
    .from("place_reports")
    .insert({
      place_id: input.placeId,
      report_status: input.status,
      reporter_session_id: input.reporterSessionId ?? DEMO_REPORTER_SESSION_ID,
      reported_latitude: input.reportedLatitude ?? null,
      reported_longitude: input.reportedLongitude ?? null,
      reported_distance_meters: input.reportedDistanceMeters ?? null,
    })
    .select("id, place_id, report_status, created_at, expires_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const status =
    normalizeReportStatus((data as RawParkingReport | null)?.report_status) ??
    input.status;

  return {
    id: String((data as RawParkingReport | null)?.id ?? fallbackReport.id),
    placeId: String(
      (data as RawParkingReport | null)?.place_id ?? input.placeId
    ),
    placeName: input.placeName,
    status,
    createdAt:
      (data as RawParkingReport | null)?.created_at ?? fallbackReport.createdAt,
    expiresAt:
      (data as RawParkingReport | null)?.expires_at ?? fallbackReport.expiresAt,
    source: "remote",
  };
}
