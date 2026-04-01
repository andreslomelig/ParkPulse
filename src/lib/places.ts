import { supabase } from "./supabase";

export type ParkingStatus = "available" | "full" | "closed" | "unknown";

export type ParkingPlace = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  status: ParkingStatus;
  updatedAt: string | null;
  source: "remote" | "fallback";
};

type RawPlace = {
  id?: string | number | null;
  name?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  lat?: number | string | null;
  lng?: number | string | null;
  status?: string | null;
  current_status?: string | null;
  effective_status?: string | null;
  updated_at?: string | null;
  last_reported_at?: string | null;
};

const PLACE_SELECT =
  "id, name, latitude, longitude, current_status, updated_at, last_reported_at";

const fallbackPlaces: ParkingPlace[] = [
  {
    id: "fallback-1",
    name: "Centro - Plaza Patria",
    latitude: 21.8817,
    longitude: -102.2961,
    status: "available",
    updatedAt: null,
    source: "fallback",
  },
  {
    id: "fallback-2",
    name: "Zona Feria - Estadio",
    latitude: 21.8728,
    longitude: -102.3091,
    status: "full",
    updatedAt: null,
    source: "fallback",
  },
  {
    id: "fallback-3",
    name: "Av. Universidad",
    latitude: 21.9143,
    longitude: -102.3096,
    status: "closed",
    updatedAt: null,
    source: "fallback",
  },
];

function toNumber(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeStatus(raw: string | null | undefined): ParkingStatus {
  const value = raw?.trim().toLowerCase();
  if (!value) return "unknown";

  if (value === "available" || value === "disponible") return "available";
  if (value === "full" || value === "lleno") return "full";
  if (value === "closed" || value === "cerrado") return "closed";
  return "unknown";
}

function mapRawPlace(place: RawPlace): ParkingPlace | null {
  const latitude = toNumber(place.latitude ?? place.lat);
  const longitude = toNumber(place.longitude ?? place.lng);
  if (latitude === null || longitude === null) return null;

  return {
    id: String(place.id ?? `generated-${latitude}-${longitude}`),
    name: place.name?.trim() || "Estacionamiento",
    latitude,
    longitude,
    status: normalizeStatus(
      place.effective_status ?? place.current_status ?? place.status
    ),
    updatedAt: place.updated_at ?? place.last_reported_at ?? null,
    source: "remote",
  };
}

async function readPlacesFrom(
  sourceName: "place_live_status" | "places"
): Promise<RawPlace[] | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(sourceName)
    .select(PLACE_SELECT)
    .order("name", { ascending: true });

  if (error) {
    console.error(`fetchPlaces ${sourceName} error:`, error.message);
    return null;
  }

  return (data as RawPlace[] | null) ?? null;
}

export async function fetchPlaces(): Promise<ParkingPlace[]> {
  if (!supabase) return fallbackPlaces;

  const rows =
    (await readPlacesFrom("place_live_status")) ??
    (await readPlacesFrom("places"));

  const places = rows
    ?.map(mapRawPlace)
    .filter((item): item is ParkingPlace => item !== null);

  return places && places.length > 0 ? places : fallbackPlaces;
}
