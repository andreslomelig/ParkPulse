import type { ParkingPlace } from "./parkingShared";
import { toTrimmedString } from "./parkingShared";
import { createSessionStorage } from "./supabase";

const STORAGE_KEY_PREFIX = "parkpulse:saved-places:";
const savedPlacesStorage = createSessionStorage();

function getSavedPlacesStorageKey(userId: string) {
  const normalizedUserId = toTrimmedString(userId);
  if (!normalizedUserId) {
    throw new Error("El usuario es obligatorio para consultar lugares guardados.");
  }

  return `${STORAGE_KEY_PREFIX}${normalizedUserId}`;
}

function normalizeSavedPlaceIds(value: unknown) {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalizedIds: string[] = [];

  value.forEach((item) => {
    const normalizedId = toTrimmedString(item);
    if (!normalizedId || seen.has(normalizedId)) {
      return;
    }

    seen.add(normalizedId);
    normalizedIds.push(normalizedId);
  });

  return normalizedIds;
}

async function persistSavedPlaceIds(userId: string, placeIds: string[]) {
  const normalizedPlaceIds = normalizeSavedPlaceIds(placeIds);
  await savedPlacesStorage.setItem(
    getSavedPlacesStorageKey(userId),
    JSON.stringify(normalizedPlaceIds)
  );

  return normalizedPlaceIds;
}

export async function fetchSavedPlaceIds(userId: string) {
  const rawValue = await savedPlacesStorage.getItem(getSavedPlacesStorageKey(userId));
  if (!rawValue) return [];

  try {
    return normalizeSavedPlaceIds(JSON.parse(rawValue));
  } catch (error) {
    console.error("savedPlaces parse error:", error);
    return [];
  }
}

export async function savePlaceForUser(userId: string, placeId: string) {
  const normalizedPlaceId = toTrimmedString(placeId);
  if (!normalizedPlaceId) {
    throw new Error("El lugar es obligatorio para guardarlo.");
  }

  const currentIds = await fetchSavedPlaceIds(userId);
  return persistSavedPlaceIds(userId, [
    normalizedPlaceId,
    ...currentIds.filter((currentId) => currentId !== normalizedPlaceId),
  ]);
}

export async function removeSavedPlaceForUser(userId: string, placeId: string) {
  const normalizedPlaceId = toTrimmedString(placeId);
  if (!normalizedPlaceId) {
    throw new Error("El lugar es obligatorio para quitarlo de guardados.");
  }

  const currentIds = await fetchSavedPlaceIds(userId);
  return persistSavedPlaceIds(
    userId,
    currentIds.filter((currentId) => currentId !== normalizedPlaceId)
  );
}

export async function toggleSavedPlaceForUser(userId: string, placeId: string) {
  const currentIds = await fetchSavedPlaceIds(userId);
  const normalizedPlaceId = toTrimmedString(placeId);

  if (!normalizedPlaceId) {
    throw new Error("El lugar es obligatorio para actualizar guardados.");
  }

  const isSaved = currentIds.includes(normalizedPlaceId);
  const placeIds = isSaved
    ? currentIds.filter((currentId) => currentId !== normalizedPlaceId)
    : [normalizedPlaceId, ...currentIds];

  const nextPlaceIds = await persistSavedPlaceIds(userId, placeIds);

  return {
    saved: !isSaved,
    placeIds: nextPlaceIds,
  };
}

export function mapSavedPlaces(places: ParkingPlace[], savedPlaceIds: string[]) {
  const placesById = new Map(places.map((place) => [place.id, place]));

  return normalizeSavedPlaceIds(savedPlaceIds)
    .map((placeId) => placesById.get(placeId) ?? null)
    .filter((place): place is ParkingPlace => place !== null);
}
