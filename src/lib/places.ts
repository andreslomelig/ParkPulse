import { getCommunitySessionId } from "./communitySession";
import {
  clampLimit,
  normalizeAccessType,
  normalizeCapacityConfidence,
  normalizeCostType,
  normalizeCurrencyCode,
  normalizeParkingStatus,
  toInteger,
  toNumber,
  toTrimmedString,
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
};

const LIVE_PLACE_SELECT = [
  "id",
  "name",
  "description",
  "address",
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
    name: "Centro - Plaza Patria",
    description: "Estacionamiento urbano con rotacion alta.",
    address: "Centro de Aguascalientes",
    latitude: 21.8817,
    longitude: -102.2961,
    status: "available",
    updatedAt: null,
    lastReportedAt: null,
    activeReportCount: 0,
    totalReportCount: 0,
    averageRating: 4.2,
    ratingCount: 12,
    costType: "paid",
    currencyCode: "MXN",
    hourlyCostMin: 20,
    hourlyCostMax: 30,
    costNotes: "Tarifa urbana por hora",
    capacityMin: 50,
    capacityMax: 80,
    capacityConfidence: "range",
    accessType: "public",
    source: "fallback",
  },
  {
    id: "fallback-2",
    name: "Zona Feria - Estadio",
    description: "Suele saturarse durante eventos.",
    address: "Zona Feria",
    latitude: 21.8728,
    longitude: -102.3091,
    status: "full",
    updatedAt: null,
    lastReportedAt: null,
    activeReportCount: 0,
    totalReportCount: 0,
    averageRating: 3.7,
    ratingCount: 8,
    costType: "paid",
    currencyCode: "MXN",
    hourlyCostMin: 25,
    hourlyCostMax: 35,
    costNotes: "Tarifa variable por evento",
    capacityMin: 120,
    capacityMax: 220,
    capacityConfidence: "estimated",
    accessType: "public",
    source: "fallback",
  },
  {
    id: "fallback-3",
    name: "Av. Universidad",
    description: "Bolsa gratuita con horario parcial.",
    address: "Av. Universidad",
    latitude: 21.9143,
    longitude: -102.3096,
    status: "closed",
    updatedAt: null,
    lastReportedAt: null,
    activeReportCount: 0,
    totalReportCount: 0,
    averageRating: null,
    ratingCount: 0,
    costType: "free",
    currencyCode: "MXN",
    hourlyCostMin: null,
    hourlyCostMax: null,
    costNotes: "Acceso libre en horario parcial",
    capacityMin: 18,
    capacityMax: 28,
    capacityConfidence: "estimated",
    accessType: "public",
    source: "fallback",
  },
];

function isMissingSchemaFieldError(message: string) {
  return message.includes("does not exist");
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
