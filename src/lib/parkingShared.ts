export type DataSource = "remote" | "fallback";

export type ParkingStatus = "available" | "full" | "closed" | "unknown";
export type ParkingReportStatus = Exclude<ParkingStatus, "unknown">;
export type ParkingCostType = "free" | "paid" | "mixed" | "unknown";
export type CapacityConfidence = "exact" | "estimated" | "range" | "unknown";
export type AccessType = "public" | "private" | "mixed" | "unknown";

export type ParkingPlace = {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  status: ParkingStatus;
  updatedAt: string | null;
  lastReportedAt: string | null;
  activeReportCount: number;
  totalReportCount: number;
  averageRating: number | null;
  ratingCount: number;
  costType: ParkingCostType;
  currencyCode: string;
  hourlyCostMin: number | null;
  hourlyCostMax: number | null;
  costNotes: string | null;
  capacityMin: number | null;
  capacityMax: number | null;
  capacityConfidence: CapacityConfidence;
  accessType: AccessType;
  source: DataSource;
};

export type ParkingReport = {
  id: string;
  placeId: string;
  placeName: string;
  status: ParkingReportStatus;
  note: string | null;
  createdAt: string;
  expiresAt: string | null;
  reportedDistanceMeters: number | null;
  reporterUserId: string | null;
  reporterDisplayName: string | null;
  source: DataSource;
};

export type ParkingRatingSummary = {
  placeId: string;
  averageRating: number | null;
  ratingCount: number;
  myRating: number;
  source: DataSource;
};

export type ParkingPlaceReview = {
  id: string;
  placeId: string;
  placeName: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string | null;
  reviewerUserId: string | null;
  reviewerDisplayName: string | null;
  source: DataSource;
};

export function toTrimmedString(value: unknown) {
  if (typeof value !== "string") return null;

  const nextValue = value.trim();
  return nextValue.length > 0 ? nextValue : null;
}

export function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsedValue = Number(value);
    if (Number.isFinite(parsedValue)) return parsedValue;
  }

  return null;
}

export function toInteger(value: unknown): number | null {
  const parsedValue = toNumber(value);
  if (parsedValue === null) return null;

  return Math.trunc(parsedValue);
}

export function normalizeParkingStatus(
  raw: string | null | undefined
): ParkingStatus {
  const value = raw?.trim().toLowerCase();
  if (!value) return "unknown";

  if (value === "available" || value === "disponible") return "available";
  if (value === "full" || value === "lleno") return "full";
  if (value === "closed" || value === "cerrado") return "closed";
  return "unknown";
}

export function normalizeParkingReportStatus(
  raw: string | null | undefined
): ParkingReportStatus | null {
  const value = normalizeParkingStatus(raw);
  return value === "unknown" ? null : value;
}

export function normalizeCostType(
  raw: string | null | undefined
): ParkingCostType {
  const value = raw?.trim().toLowerCase();
  if (value === "free" || value === "gratis") return "free";
  if (value === "paid" || value === "pago") return "paid";
  if (value === "mixed" || value === "mixto") return "mixed";
  return "unknown";
}

export function normalizeCapacityConfidence(
  raw: string | null | undefined
): CapacityConfidence {
  const value = raw?.trim().toLowerCase();
  if (value === "exact") return "exact";
  if (value === "estimated" || value === "estimado") return "estimated";
  if (value === "range" || value === "rango") return "range";
  return "unknown";
}

export function normalizeAccessType(
  raw: string | null | undefined
): AccessType {
  const value = raw?.trim().toLowerCase();
  if (value === "public" || value === "publico") return "public";
  if (value === "private" || value === "privado") return "private";
  if (value === "mixed" || value === "mixto") return "mixed";
  return "unknown";
}

export function normalizeCurrencyCode(
  raw: string | null | undefined,
  fallback = "MXN"
) {
  const value = raw?.trim().toUpperCase();
  return value && value.length > 0 ? value : fallback;
}

export function normalizeRatingValue(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;

  if (value < 1 || value > 5) return null;
  return Math.round(value);
}

export function clampLimit(limit: number, fallback: number) {
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.max(1, Math.trunc(limit));
}
