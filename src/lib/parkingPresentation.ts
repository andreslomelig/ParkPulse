import type { ParkingPlace } from "./parkingShared";

function formatMoneyValue(amount: number) {
  const safeAmount = Number(amount.toFixed(2));
  return Number.isInteger(safeAmount) ? String(safeAmount) : safeAmount.toFixed(2);
}

export function formatCostSummary(place: Pick<
  ParkingPlace,
  "costType" | "currencyCode" | "hourlyCostMin" | "hourlyCostMax" | "costNotes"
>) {
  if (place.costType === "free") return "Gratis";

  const currencyCode = place.currencyCode || "MXN";
  const min = place.hourlyCostMin;
  const max = place.hourlyCostMax;

  if (min !== null && max !== null) {
    if (min === max) return `${currencyCode} ${formatMoneyValue(min)}/h`;
    return `${currencyCode} ${formatMoneyValue(min)}-${formatMoneyValue(max)}/h`;
  }

  if (min !== null) return `Desde ${currencyCode} ${formatMoneyValue(min)}/h`;
  if (max !== null) return `Hasta ${currencyCode} ${formatMoneyValue(max)}/h`;

  if (place.costType === "mixed") {
    return place.costNotes ?? "Tarifa mixta";
  }

  if (place.costType === "paid") {
    return place.costNotes ?? "Tarifa por validar";
  }

  return place.costNotes ?? "Sin datos";
}

export function formatCapacitySummary(place: Pick<
  ParkingPlace,
  "capacityMin" | "capacityMax"
>) {
  const min = place.capacityMin;
  const max = place.capacityMax;

  if (min !== null && max !== null) {
    if (min === max) return `${min} autos`;
    return `${min}-${max} autos`;
  }

  if (min !== null) return `${min}+ autos`;
  if (max !== null) return `Hasta ${max} autos`;
  return "Por validar";
}

export function formatRatingSummary(place: Pick<
  ParkingPlace,
  "averageRating" | "ratingCount"
>) {
  if (place.averageRating === null || place.ratingCount === 0) {
    return "Sin calificaciones";
  }

  return `${place.averageRating.toFixed(1)}/5 (${place.ratingCount})`;
}

export function formatRatingBadgeSummary(place: Pick<
  ParkingPlace,
  "averageRating" | "ratingCount"
>) {
  if (place.averageRating === null || place.ratingCount === 0) {
    return "Sin calificaciones";
  }

  return `${place.averageRating.toFixed(1)} / 5 (${place.ratingCount})`;
}

export function formatReportVolumeSummary(place: Pick<
  ParkingPlace,
  "totalReportCount"
>) {
  if (place.totalReportCount === 0) return "Sin reportes";
  if (place.totalReportCount === 1) return "1 reporte";
  return `${place.totalReportCount} reportes`;
}
