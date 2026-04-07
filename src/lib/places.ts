import { getCommunitySessionId } from "./communitySession";
import {
  clampLimit,
  isParkingWeekday,
  normalizeAccessType,
  normalizeCapacityConfidence,
  normalizeCostType,
  normalizeCurrencyCode,
  normalizeParkingStatus,
  normalizeParkingTrustLevel,
  PARKING_WEEKDAY_LABELS,
  PARKING_WEEKDAYS,
  toInteger,
  toNumber,
  toTrimmedString,
  type ParkingHoursMap,
  type ParkingPlace,
} from "./parkingShared";
import { getSupabaseClient, requireSupabaseClient } from "./supabase";

export type {
  AccessType,
  CapacityConfidence,
  ParkingCostType,
  ParkingPlace,
  ParkingStatus,
} from "./parkingShared";

export type CreateParkingPlaceInput = {
  name: string;
  latitude: number;
  longitude: number;
  description?: string | null;
  address?: string | null;
  openingHours?: ParkingHoursMap | null;
  closingHours?: ParkingHoursMap | null;
  costType?: string | null;
  currencyCode?: string | null;
  hourlyCostMin?: number | null;
  hourlyCostMax?: number | null;
  costNotes?: string | null;
  capacityMin?: number | null;
  capacityMax?: number | null;
  capacityConfidence?: string | null;
  accessType?: string | null;
  createdBySessionId?: string | null;
};

type RawPlace = {
  id?: string | number | null;
  name?: string | null;
  description?: string | null;
  address?: string | null;
  opening_hours?: unknown;
  closing_hours?: unknown;
  latitude?: number | string | null;
  longitude?: number | string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  status?: string | null;
  current_status?: string | null;
  effective_status?: string | null;
  updated_at?: string | null;
  last_reported_at?: string | null;
  active_report_count?: number | string | null;
  total_report_count?: number | string | null;
  average_rating?: number | string | null;
  rating_count?: number | string | null;
  cost_type?: string | null;
  currency_code?: string | null;
  hourly_cost_min?: number | string | null;
  hourly_cost_max?: number | string | null;
  cost_notes?: string | null;
  capacity_min?: number | string | null;
  capacity_max?: number | string | null;
  capacity_confidence?: string | null;
  access_type?: string | null;
  status_confidence?: string | null;
  status_report_count?: number | string | null;
  status_trust_score?: number | string | null;
  recommended_refresh_seconds?: number | string | null;
};

const LIVE_PLACE_SELECT = [
  "id",
  "name",
  "description",
  "address",
  "opening_hours",
  "closing_hours",
  "latitude",
  "longitude",
  "cost_type",
  "currency_code",
  "hourly_cost_min",
  "hourly_cost_max",
  "cost_notes",
  "capacity_min",
  "capacity_max",
  "capacity_confidence",
  "access_type",
  "current_status",
  "updated_at",
  "last_reported_at",
  "active_report_count",
  "total_report_count",
  "average_rating",
  "rating_count",
  "status_confidence",
  "status_report_count",
  "status_trust_score",
  "recommended_refresh_seconds",
].join(", ");

const LEGACY_LIVE_PLACE_SELECT = [
  "id",
  "name",
  "latitude",
  "longitude",
  "current_status",
  "updated_at",
  "last_reported_at",
  "active_report_count",
  "total_report_count",
].join(", ");

const BASE_PLACE_SELECT = [
  "id",
  "name",
  "description",
  "address",
  "opening_hours",
  "closing_hours",
  "latitude",
  "longitude",
  "cost_type",
  "currency_code",
  "hourly_cost_min",
  "hourly_cost_max",
  "cost_notes",
  "capacity_min",
  "capacity_max",
  "capacity_confidence",
  "access_type",
  "status_confidence",
  "status_report_count",
  "status_trust_score",
  "recommended_refresh_seconds",
  "current_status",
  "updated_at",
].join(", ");

const LEGACY_BASE_PLACE_SELECT = [
  "id",
  "name",
  "latitude",
  "longitude",
  "current_status",
  "updated_at",
].join(", ");

const fallbackPlaces: ParkingPlace[] = [
  {
    id: "fallback-1",
    name: "Plaza Patria",
    description: "Plaza comercial del centro historico con estacionamiento de uso comercial.",
    address: "Centro Comercial Plaza Patria, 5 de Mayo, Zona Centro, 20000 Aguascalientes, Ags.",
    openingHours: {
      monday: "08:00",
      tuesday: "08:00",
      wednesday: "08:00",
      thursday: "08:00",
      friday: "08:00",
      saturday: "08:00",
      sunday: "09:00",
    },
    closingHours: {
      monday: "22:00",
      tuesday: "22:00",
      wednesday: "22:00",
      thursday: "22:00",
      friday: "22:00",
      saturday: "22:00",
      sunday: "20:00",
    },
    latitude: 21.8790925,
    longitude: -102.2965229,
    status: "available",
    updatedAt: null,
    lastReportedAt: null,
    activeReportCount: 0,
    totalReportCount: 0,
    averageRating: 4.2,
    ratingCount: 12,
    costType: "unknown",
    currencyCode: "MXN",
    hourlyCostMin: null,
    hourlyCostMax: null,
    costNotes: null,
    capacityMin: null,
    capacityMax: null,
    capacityConfidence: "unknown",
    accessType: "mixed",
    statusConfidence: "medium",
    statusReportCount: 0,
    statusTrustScore: null,
    recommendedRefreshSeconds: 180,
    source: "fallback",
  },
  {
    id: "fallback-2",
    name: "Estadio Victoria",
    description: "Estadio de futbol con estacionamiento para dias de partido y eventos.",
    address: "Calle Privada Jose Marin Iglesias, Colonia Heroes, 20259 Aguascalientes, Ags.",
    openingHours: {
      monday: null,
      tuesday: null,
      wednesday: null,
      thursday: null,
      friday: "17:00",
      saturday: "15:00",
      sunday: "12:00",
    },
    closingHours: {
      monday: null,
      tuesday: null,
      wednesday: null,
      thursday: null,
      friday: "23:00",
      saturday: "23:00",
      sunday: "22:00",
    },
    latitude: 21.8806558,
    longitude: -102.2754788,
    status: "full",
    updatedAt: null,
    lastReportedAt: null,
    activeReportCount: 0,
    totalReportCount: 0,
    averageRating: 3.7,
    ratingCount: 8,
    costType: "unknown",
    currencyCode: "MXN",
    hourlyCostMin: null,
    hourlyCostMax: null,
    costNotes: null,
    capacityMin: null,
    capacityMax: null,
    capacityConfidence: "unknown",
    accessType: "public",
    statusConfidence: "medium",
    statusReportCount: 0,
    statusTrustScore: null,
    recommendedRefreshSeconds: 180,
    source: "fallback",
  },
  {
    id: "fallback-3",
    name: "Centro Comercial Altaria",
    description: "Centro comercial al norte de la ciudad con estacionamiento para visitantes.",
    address: "Boulevard a Zacatecas Km. 537, Trojes de Alonso, 20116 Aguascalientes, Ags.",
    openingHours: {
      monday: "10:00",
      tuesday: "10:00",
      wednesday: "10:00",
      thursday: "10:00",
      friday: "10:00",
      saturday: "10:00",
      sunday: "11:00",
    },
    closingHours: {
      monday: "22:00",
      tuesday: "22:00",
      wednesday: "22:00",
      thursday: "22:00",
      friday: "23:00",
      saturday: "23:00",
      sunday: "21:00",
    },
    latitude: 21.9237481,
    longitude: -102.2892982,
    status: "unknown",
    updatedAt: null,
    lastReportedAt: null,
    activeReportCount: 0,
    totalReportCount: 0,
    averageRating: null,
    ratingCount: 0,
    costType: "unknown",
    currencyCode: "MXN",
    hourlyCostMin: null,
    hourlyCostMax: null,
    costNotes: null,
    capacityMin: null,
    capacityMax: null,
    capacityConfidence: "unknown",
    accessType: "mixed",
    statusConfidence: "low",
    statusReportCount: 0,
    statusTrustScore: null,
    recommendedRefreshSeconds: 300,
    source: "fallback",
  },
];

function isMissingSchemaFieldError(message: string) {
  return message.includes("does not exist");
}

function normalizeHourText(value: unknown): string | null | undefined {
  const trimmedValue = toTrimmedString(value);
  if (!trimmedValue) return null;

  const compactValue = trimmedValue.replace(/\s+/g, "").replace(/[.,]/g, ":");
  const match = compactValue.match(/^(\d{1,2})(?::?(\d{2}))$/);
  if (!match) return undefined;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return undefined;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function toParkingHoursMap(value: unknown): ParkingHoursMap | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const nextMap: ParkingHoursMap = {};
  let hasAnyValue = false;

  for (const [day, rawValue] of Object.entries(value as Record<string, unknown>)) {
    if (!isParkingWeekday(day)) continue;

    if (rawValue === null) {
      nextMap[day] = null;
      hasAnyValue = true;
      continue;
    }

    const normalizedHour = normalizeHourText(rawValue);
    if (!normalizedHour) continue;

    nextMap[day] = normalizedHour;
    hasAnyValue = true;
  }

  return hasAnyValue ? nextMap : null;
}

function normalizeParkingHours(
  openingHoursInput: unknown,
  closingHoursInput: unknown
) {
  const openingIsMissing =
    openingHoursInput === null || openingHoursInput === undefined;
  const closingIsMissing =
    closingHoursInput === null || closingHoursInput === undefined;

  if (openingIsMissing && closingIsMissing) {
    return {
      openingHours: null,
      closingHours: null,
    };
  }

  if (openingIsMissing || closingIsMissing) {
    throw new Error("El horario semanal necesita apertura y cierre por dia.");
  }

  if (
    typeof openingHoursInput !== "object" ||
    Array.isArray(openingHoursInput) ||
    typeof closingHoursInput !== "object" ||
    Array.isArray(closingHoursInput)
  ) {
    throw new Error("El horario semanal del estacionamiento es invalido.");
  }

  const rawOpeningHours = openingHoursInput as Record<string, unknown>;
  const rawClosingHours = closingHoursInput as Record<string, unknown>;
  const invalidDay = [...Object.keys(rawOpeningHours), ...Object.keys(rawClosingHours)].find(
    (day) => !isParkingWeekday(day)
  );
  if (invalidDay) {
    throw new Error("El horario semanal contiene dias invalidos.");
  }

  const normalizedOpeningHours: ParkingHoursMap = {};
  const normalizedClosingHours: ParkingHoursMap = {};
  let hasAnyValue = false;

  for (const day of PARKING_WEEKDAYS) {
    const openingHasValue = Object.prototype.hasOwnProperty.call(rawOpeningHours, day);
    const closingHasValue = Object.prototype.hasOwnProperty.call(rawClosingHours, day);
    if (!openingHasValue && !closingHasValue) continue;

    const dayLabel = PARKING_WEEKDAY_LABELS[day].toLowerCase();
    if (openingHasValue !== closingHasValue) {
      throw new Error(`Completa tanto la apertura como el cierre del ${dayLabel}.`);
    }

    const rawOpeningValue = rawOpeningHours[day];
    const rawClosingValue = rawClosingHours[day];

    if (rawOpeningValue === null && rawClosingValue === null) {
      normalizedOpeningHours[day] = null;
      normalizedClosingHours[day] = null;
      hasAnyValue = true;
      continue;
    }

    const normalizedOpeningValue = normalizeHourText(rawOpeningValue);
    const normalizedClosingValue = normalizeHourText(rawClosingValue);

    if (
      normalizedOpeningValue === undefined ||
      normalizedClosingValue === undefined
    ) {
      throw new Error(`Usa formato HH:MM para el horario del ${dayLabel}.`);
    }

    if (normalizedOpeningValue === null || normalizedClosingValue === null) {
      throw new Error(`Completa tanto la apertura como el cierre del ${dayLabel}.`);
    }

    if (normalizedClosingValue <= normalizedOpeningValue) {
      throw new Error(
        `La hora de cierre del ${dayLabel} debe ser posterior a la de apertura.`
      );
    }

    normalizedOpeningHours[day] = normalizedOpeningValue;
    normalizedClosingHours[day] = normalizedClosingValue;
    hasAnyValue = true;
  }

  return {
    openingHours: hasAnyValue ? normalizedOpeningHours : null,
    closingHours: hasAnyValue ? normalizedClosingHours : null,
  };
}

export function normalizeCreateParkingPlaceInput(
  input: CreateParkingPlaceInput
) {
  const name = toTrimmedString(input.name);
  const latitude = toNumber(input.latitude);
  const longitude = toNumber(input.longitude);
  const hourlyCostMin = toNumber(input.hourlyCostMin);
  const hourlyCostMax = toNumber(input.hourlyCostMax);
  const capacityMin = toInteger(input.capacityMin);
  const capacityMax = toInteger(input.capacityMax);
  const { openingHours, closingHours } = normalizeParkingHours(
    input.openingHours,
    input.closingHours
  );

  if (!name) {
    throw new Error("El nombre del estacionamiento es obligatorio.");
  }

  if (latitude === null || longitude === null) {
    throw new Error("Las coordenadas del estacionamiento son invalidas.");
  }

  if (
    hourlyCostMin !== null &&
    hourlyCostMax !== null &&
    hourlyCostMax < hourlyCostMin
  ) {
    throw new Error("El costo maximo no puede ser menor al costo minimo.");
  }

  if (capacityMin !== null && capacityMax !== null && capacityMax < capacityMin) {
    throw new Error("La capacidad maxima no puede ser menor a la minima.");
  }

  return {
    name,
    latitude,
    longitude,
    description: toTrimmedString(input.description),
    address: toTrimmedString(input.address),
    openingHours,
    closingHours,
    costType: normalizeCostType(input.costType),
    currencyCode: normalizeCurrencyCode(input.currencyCode),
    hourlyCostMin,
    hourlyCostMax,
    costNotes: toTrimmedString(input.costNotes),
    capacityMin,
    capacityMax,
    capacityConfidence: normalizeCapacityConfidence(input.capacityConfidence),
    accessType: normalizeAccessType(input.accessType),
    createdBySessionId:
      toTrimmedString(input.createdBySessionId) ?? getCommunitySessionId(),
  };
}

function mapRawPlace(place: RawPlace): ParkingPlace | null {
  const latitude = toNumber(place.latitude ?? place.lat);
  const longitude = toNumber(place.longitude ?? place.lng);
  if (latitude === null || longitude === null) return null;

  return {
    id: String(place.id ?? `generated-${latitude}-${longitude}`),
    name: toTrimmedString(place.name) ?? "Estacionamiento",
    description: toTrimmedString(place.description),
    address: toTrimmedString(place.address),
    openingHours: toParkingHoursMap(place.opening_hours),
    closingHours: toParkingHoursMap(place.closing_hours),
    latitude,
    longitude,
    status: normalizeParkingStatus(
      place.effective_status ?? place.current_status ?? place.status
    ),
    updatedAt: place.updated_at ?? null,
    lastReportedAt: place.last_reported_at ?? null,
    activeReportCount: toInteger(place.active_report_count) ?? 0,
    totalReportCount: toInteger(place.total_report_count) ?? 0,
    averageRating: toNumber(place.average_rating),
    ratingCount: toInteger(place.rating_count) ?? 0,
    costType: normalizeCostType(place.cost_type),
    currencyCode: normalizeCurrencyCode(place.currency_code),
    hourlyCostMin: toNumber(place.hourly_cost_min),
    hourlyCostMax: toNumber(place.hourly_cost_max),
    costNotes: toTrimmedString(place.cost_notes),
    capacityMin: toInteger(place.capacity_min),
    capacityMax: toInteger(place.capacity_max),
    capacityConfidence: normalizeCapacityConfidence(place.capacity_confidence),
    accessType: normalizeAccessType(place.access_type),
    statusConfidence: normalizeParkingTrustLevel(place.status_confidence),
    statusReportCount: toInteger(place.status_report_count) ?? 0,
    statusTrustScore: toNumber(place.status_trust_score),
    recommendedRefreshSeconds: toInteger(place.recommended_refresh_seconds),
    source: "remote",
  };
}

async function readPlacesFromView() {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("place_live_status")
    .select(LIVE_PLACE_SELECT)
    .order("name", { ascending: true });

  if (error) {
    if (!isMissingSchemaFieldError(error.message)) {
      console.error("fetchPlaces place_live_status error:", error.message);
      return null;
    }

    const legacyResult = await client
      .from("place_live_status")
      .select(LEGACY_LIVE_PLACE_SELECT)
      .order("name", { ascending: true });

    if (legacyResult.error) {
      console.error(
        "fetchPlaces place_live_status legacy error:",
        legacyResult.error.message
      );
      return null;
    }

    return (legacyResult.data as RawPlace[] | null) ?? null;
  }

  return (data as RawPlace[] | null) ?? null;
}

async function readPlacesFromTable() {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("places")
    .select(BASE_PLACE_SELECT)
    .order("name", { ascending: true });

  if (error) {
    if (!isMissingSchemaFieldError(error.message)) {
      console.error("fetchPlaces places error:", error.message);
      return null;
    }

    const legacyResult = await client
      .from("places")
      .select(LEGACY_BASE_PLACE_SELECT)
      .order("name", { ascending: true });

    if (legacyResult.error) {
      console.error("fetchPlaces places legacy error:", legacyResult.error.message);
      return null;
    }

    return (legacyResult.data as RawPlace[] | null) ?? null;
  }

  return (data as RawPlace[] | null) ?? null;
}

export async function fetchPlaces(): Promise<ParkingPlace[]> {
  const rows = (await readPlacesFromView()) ?? (await readPlacesFromTable());

  const places = rows
    ?.map(mapRawPlace)
    .filter((item): item is ParkingPlace => item !== null);

  return places && places.length > 0 ? places : fallbackPlaces;
}

export async function fetchPlaceById(placeId: string): Promise<ParkingPlace | null> {
  const normalizedPlaceId = toTrimmedString(placeId);
  if (!normalizedPlaceId) return null;

  const client = getSupabaseClient();
  if (!client) {
    return fallbackPlaces.find((place) => place.id === normalizedPlaceId) ?? null;
  }

  const { data, error } = await client
    .from("place_live_status")
    .select(LIVE_PLACE_SELECT)
    .eq("id", normalizedPlaceId)
    .maybeSingle();

  if (error) {
    if (!isMissingSchemaFieldError(error.message)) {
      console.error("fetchPlaceById error:", error.message);
      return null;
    }

    const legacyResult = await client
      .from("place_live_status")
      .select(LEGACY_LIVE_PLACE_SELECT)
      .eq("id", normalizedPlaceId)
      .maybeSingle();

    if (legacyResult.error) {
      console.error("fetchPlaceById legacy error:", legacyResult.error.message);
      return null;
    }

    return mapRawPlace((legacyResult.data as RawPlace | null) ?? {});
  }

  return mapRawPlace((data as RawPlace | null) ?? {});
}

export async function createParkingPlace(
  input: CreateParkingPlaceInput
): Promise<ParkingPlace> {
  const normalizedInput = normalizeCreateParkingPlaceInput(input);
  const client = requireSupabaseClient();

  const { data, error } = await client.rpc("create_place", {
    input_name: normalizedInput.name,
    input_latitude: normalizedInput.latitude,
    input_longitude: normalizedInput.longitude,
    input_description: normalizedInput.description,
    input_address: normalizedInput.address,
    input_opening_hours: normalizedInput.openingHours,
    input_closing_hours: normalizedInput.closingHours,
    input_cost_type: normalizedInput.costType,
    input_currency_code: normalizedInput.currencyCode,
    input_hourly_cost_min: normalizedInput.hourlyCostMin,
    input_hourly_cost_max: normalizedInput.hourlyCostMax,
    input_cost_notes: normalizedInput.costNotes,
    input_capacity_min: normalizedInput.capacityMin,
    input_capacity_max: normalizedInput.capacityMax,
    input_capacity_confidence: normalizedInput.capacityConfidence,
    input_access_type: normalizedInput.accessType,
    input_created_by_session_id: normalizedInput.createdBySessionId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const createdPlace = Array.isArray(data) ? data[0] : data;
  const mappedPlace = mapRawPlace((createdPlace as RawPlace | null) ?? {});

  if (!mappedPlace) {
    throw new Error("No se pudo interpretar el estacionamiento creado.");
  }

  return mappedPlace;
}

export function limitPlaces(list: ParkingPlace[], limit: number) {
  return list.slice(0, clampLimit(limit, list.length || 1));
}
