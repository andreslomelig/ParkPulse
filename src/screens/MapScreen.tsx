import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  Text,
  View,
} from "react-native";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import MapView, { Marker, Region } from "react-native-maps";
import * as Location from "expo-location";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  createParkingPlace,
  fetchPlaceById,
  fetchPlaces,
  type ParkingPlace,
  type ParkingStatus,
} from "../lib/places";
import {
  formatCapacitySummary,
  formatCostSummary,
  formatRatingBadgeSummary,
  formatReportVolumeSummary,
} from "../lib/parkingPresentation";
import {
  fetchRecentReports,
  fetchReportsForPlace,
  submitParkingReport,
  type ParkingReport,
} from "../lib/reports";
import type { AuthenticatedAppUser } from "../lib/auth";
import StarRatingRow from "../components/StarRatingRow";
import {
  fetchSavedPlaceIds,
  toggleSavedPlaceForUser,
} from "../lib/savedPlaces";
import { fetchPlaceReviews, type ParkingPlaceReview } from "../lib/reviews";
import {
  getParkingDayHours,
  hasParkingHours,
  PARKING_WEEKDAY_LABELS,
  PARKING_WEEKDAYS,
  type ParkingHoursMap,
  type ParkingWeekday,
} from "../lib/parkingShared";

type PermissionState = "unknown" | "granted" | "denied";
type LatLng = { latitude: number; longitude: number };
type ReportStatus = Exclude<ParkingStatus, "unknown">;
type NewPlaceDayHoursDraft = {
  open: string;
  close: string;
  isClosed: boolean;
};
type NewPlaceWeeklyHoursDraft = Record<ParkingWeekday, NewPlaceDayHoursDraft>;
type NewPlaceDraft = {
  name: string;
  address: string;
  description: string;
  weeklyHours: NewPlaceWeeklyHoursDraft;
  hourlyCostMin: string;
  hourlyCostMax: string;
  costNotes: string;
  capacityMin: string;
  capacityMax: string;
};

export type MapScreenProps = {
  currentUser: AuthenticatedAppUser;
  onOpenProfileSettings?: () => void;
  onOpenPrivacyLegal?: () => void;
  onOpenReportHistory?: () => void;
  onOpenSavedPlaces?: () => void;
  onOpenPlaceReview?: (place: ParkingPlace) => void;
  pendingFocusPlaceId?: string | null;
  pendingFocusRequestId?: number | null;
  pendingPlaceRefreshRequestId?: number | null;
  onSignOut: () => void | Promise<void>;
};

const PILOT_REGION: Region = {
  latitude: 21.88234,
  longitude: -102.28259,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const REPORT_RADIUS_METERS = 200;
const RECENT_REPORTS_LIMIT = 5;
const PLACE_HISTORY_LIMIT = 4;
const PLACE_REVIEWS_LIMIT = 25;
const JS_DAY_TO_PARKING_WEEKDAY: Record<number, ParkingWeekday> = {
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
};

async function fetchMapOverviewData() {
  const [nextPlaces, nextReports] = await Promise.all([
    fetchPlaces(),
    fetchRecentReports(RECENT_REPORTS_LIMIT),
  ]);

  return { nextPlaces, nextReports };
}

function createEmptyNewPlaceDraft(): NewPlaceDraft {
  const weeklyHours = PARKING_WEEKDAYS.reduce((draft, day) => {
    draft[day] = {
      open: "",
      close: "",
      isClosed: false,
    };
    return draft;
  }, {} as NewPlaceWeeklyHoursDraft);

  return {
    name: "",
    address: "",
    description: "",
    weeklyHours,
    hourlyCostMin: "",
    hourlyCostMax: "",
    costNotes: "",
    capacityMin: "",
    capacityMax: "",
  };
}

function getElapsedLabel(isoDate: string | null) {
  if (!isoDate) return null;

  const diffMs = Date.now() - new Date(isoDate).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "hace un momento";

  const mins = Math.max(1, Math.floor(diffMs / (1000 * 60)));
  if (mins < 60) return `hace ${mins} min`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;

  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

function statusToLabel(status: ParkingStatus) {
  switch (status) {
    case "available":
      return "Disponible";
    case "full":
      return "Lleno";
    case "closed":
      return "Cerrado";
    default:
      return "Sin datos";
  }
}

function statusToColor(status: ParkingStatus) {
  switch (status) {
    case "available":
      return "#16a34a";
    case "full":
      return "#ef4444";
    case "closed":
      return "#475569";
    default:
      return "#f59e0b";
  }
}

function getUpdatedLabel(place: ParkingPlace) {
  const elapsedLabel = getElapsedLabel(place.updatedAt);
  return elapsedLabel ? `Actualizado ${elapsedLabel}` : "Sin actualizacion reciente";
}

function getStatusSupportLabel(status: ParkingStatus) {
  switch (status) {
    case "available":
      return "Alta probabilidad de encontrar espacio";
    case "full":
      return "Considera una opcion cercana";
    case "closed":
      return "No disponible por ahora";
    default:
      return "Esperando validaciones de la comunidad";
  }
}

function getAccessTypeLabel(accessType: ParkingPlace["accessType"]) {
  switch (accessType) {
    case "public":
      return "Publico";
    case "private":
      return "Privado";
    case "mixed":
      return "Mixto";
    default:
      return "Por validar";
  }
}

function getUserDisplayName(user: AuthenticatedAppUser) {
  return user.fullName ?? user.email;
}

function getUserInitials(user: AuthenticatedAppUser) {
  return getInitialsFromLabel(getUserDisplayName(user));
}

function getInitialsFromLabel(label: string | null) {
  const displayName = label ?? "PP";
  const parts = displayName
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return "PP";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function parseOptionalNumberInput(value: string) {
  const normalizedValue = value.trim().replace(",", ".");
  if (!normalizedValue) return null;

  const parsedValue = Number(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function buildDraftHoursPayload(draft: NewPlaceDraft) {
  const openingHours: ParkingHoursMap = {};
  const closingHours: ParkingHoursMap = {};
  let hasAnyValue = false;

  for (const day of PARKING_WEEKDAYS) {
    const dayDraft = draft.weeklyHours[day];
    if (dayDraft.isClosed) {
      openingHours[day] = null;
      closingHours[day] = null;
      hasAnyValue = true;
      continue;
    }

    const openingValue = dayDraft.open.trim();
    const closingValue = dayDraft.close.trim();
    if (!openingValue && !closingValue) {
      continue;
    }

    openingHours[day] = openingValue || null;
    closingHours[day] = closingValue || null;
    hasAnyValue = true;
  }

  return {
    openingHours: hasAnyValue ? openingHours : null,
    closingHours: hasAnyValue ? closingHours : null,
  };
}

function formatPlaceHoursForDay(
  place: ParkingPlace,
  day: ParkingWeekday
) {
  const dayHours = getParkingDayHours(place.openingHours, place.closingHours, day);
  if (dayHours.status === "closed") return "Cerrado";
  if (dayHours.status === "open") {
    return `${dayHours.opensAt} - ${dayHours.closesAt}`;
  }

  return "Por validar";
}

function getTodayHoursSummary(place: ParkingPlace) {
  if (!hasParkingHours(place.openingHours, place.closingHours)) {
    return "Horario por validar";
  }

  const today = JS_DAY_TO_PARKING_WEEKDAY[new Date().getDay()] ?? "monday";
  const label = formatPlaceHoursForDay(place, today);
  return `Hoy: ${label}`;
}

function getDraftCostType(draft: NewPlaceDraft) {
  const min = parseOptionalNumberInput(draft.hourlyCostMin);
  const max = parseOptionalNumberInput(draft.hourlyCostMax);
  const hasCostSignal = min !== null || max !== null || draft.costNotes.trim().length > 0;

  if (!hasCostSignal) return "unknown";
  if (min === 0 && max === 0) return "free";
  return "paid";
}

function getDraftCapacityConfidence(draft: NewPlaceDraft) {
  const min = parseOptionalNumberInput(draft.capacityMin);
  const max = parseOptionalNumberInput(draft.capacityMax);

  if (min !== null && max !== null) {
    return min === max ? "exact" : "range";
  }

  if (min !== null || max !== null) return "estimated";
  return "unknown";
}

function distanceInMeters(from: LatLng, to: LatLng) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLng = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function MapScreen({
  currentUser,
  onOpenProfileSettings,
  onOpenReportHistory,
  onOpenPlaceReview,
  onOpenPrivacyLegal,
  onOpenSavedPlaces,
  pendingFocusPlaceId,
  pendingFocusRequestId,
  pendingPlaceRefreshRequestId,
  onSignOut,
}: MapScreenProps) {
  const mapRef = useRef<MapView>(null);
  const placeSheetRef = useRef<BottomSheet>(null);
  const addPlaceSheetRef = useRef<BottomSheet>(null);
  const ignoreNextMapPressRef = useRef(false);
  const lastHandledFocusRequestIdRef = useRef<number | null>(null);
  const lastHandledPlaceRefreshRequestIdRef = useRef<number | null>(null);

  const [permission, setPermission] = useState<PermissionState>("unknown");
  const [region, setRegion] = useState<Region | null>(null);
  const [userCoord, setUserCoord] = useState<LatLng | null>(null);
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(true);
  const [places, setPlaces] = useState<ParkingPlace[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [isAddMode, setIsAddMode] = useState(false);
  const [draftPlaceCoord, setDraftPlaceCoord] = useState<LatLng | null>(null);
  const [reportingPlaceId, setReportingPlaceId] = useState<string | null>(null);
  const [placeSheetIndex, setPlaceSheetIndex] = useState(0);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([
    "Plaza Patria",
    "Centro Comercial Altaria",
    "Estadio Victoria",
  ]);
  const [savedPlaceIds, setSavedPlaceIds] = useState<string[]>([]);
  const [isLoadingSavedPlaces, setIsLoadingSavedPlaces] = useState(true);
  const [isTogglingSavedPlace, setIsTogglingSavedPlace] = useState(false);
  const [recentReports, setRecentReports] = useState<ParkingReport[]>([]);
  const [selectedPlaceReports, setSelectedPlaceReports] = useState<ParkingReport[]>([]);
  const [selectedPlaceReviews, setSelectedPlaceReviews] = useState<ParkingPlaceReview[]>([]);
  const [isLoadingPlaceHistory, setIsLoadingPlaceHistory] = useState(false);
  const [isLoadingPlaceReviews, setIsLoadingPlaceReviews] = useState(false);
  const [isReviewsModalOpen, setIsReviewsModalOpen] = useState(false);
  const [placeDetailsRefreshKey, setPlaceDetailsRefreshKey] = useState(0);
  const [addPlaceSheetIndex, setAddPlaceSheetIndex] = useState(1);
  const [newPlaceDraft, setNewPlaceDraft] = useState<NewPlaceDraft>(
    createEmptyNewPlaceDraft()
  );
  const [isSavingPlace, setIsSavingPlace] = useState(false);
  const addPlaceSheetSnapPoints = useMemo(() => ["34%", "78%"], []);
  const placeSheetSnapPoints = useMemo(() => ["32%", "76%"], []);
  const isPlaceSheetExpanded = placeSheetIndex === 1;

  useEffect(() => {
    let active = true;

    const load = async () => {
      setIsLoadingPlaces(true);
      const { nextPlaces, nextReports } = await fetchMapOverviewData();
      if (active) {
        setPlaces(nextPlaces);
        setRecentReports(nextReports);
        setSelectedPlaceId(nextPlaces[0]?.id ?? null);
        setPlaceSheetIndex(0);
        setIsLoadingPlaces(false);
      }
    };

    load().catch((e) => {
      console.error(e);
      Alert.alert("Error", "No se pudo cargar estacionamientos.");
      setIsLoadingPlaces(false);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    fetchSavedPlaceIds(currentUser.id)
      .then((nextSavedPlaceIds) => {
        if (!active) return;

        setSavedPlaceIds(nextSavedPlaceIds);
        setIsLoadingSavedPlaces(false);
      })
      .catch((error) => {
        console.error(error);
        if (!active) return;

        setSavedPlaceIds([]);
        setIsLoadingSavedPlaces(false);
      });

    return () => {
      active = false;
    };
  }, [currentUser.id]);

  useEffect(() => {
    let active = true;

    if (!selectedPlaceId) {
      setSelectedPlaceReports([]);
      setSelectedPlaceReviews([]);
      setIsReviewsModalOpen(false);
      return () => {
        active = false;
      };
    }

    setIsLoadingPlaceHistory(true);
    setIsLoadingPlaceReviews(true);
    Promise.allSettled([
      fetchReportsForPlace(selectedPlaceId, PLACE_HISTORY_LIMIT),
      fetchPlaceReviews(selectedPlaceId, PLACE_REVIEWS_LIMIT),
    ])
      .then(([historyResult, reviewsResult]) => {
        if (!active) return;

        if (historyResult.status === "fulfilled") {
          setSelectedPlaceReports(historyResult.value);
        } else {
          console.error(historyResult.reason);
          setSelectedPlaceReports([]);
        }

        if (reviewsResult.status === "fulfilled") {
          setSelectedPlaceReviews(reviewsResult.value);
        } else {
          console.error(reviewsResult.reason);
          setSelectedPlaceReviews([]);
        }

        setIsLoadingPlaceHistory(false);
        setIsLoadingPlaceReviews(false);
      })
      .catch((e) => {
        console.error(e);
        if (!active) return;
        setSelectedPlaceReports([]);
        setSelectedPlaceReviews([]);
        setIsLoadingPlaceHistory(false);
        setIsLoadingPlaceReviews(false);
      });

    return () => {
      active = false;
    };
  }, [selectedPlaceId, placeDetailsRefreshKey]);

  const requestUserLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setPermission("denied");
      return null;
    }

    setPermission("granted");

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const coord = {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    };

    setUserCoord(coord);

    return {
      coord,
      region: {
        ...coord,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      } satisfies Region,
    };
  };

  useEffect(() => {
    requestUserLocation()
      .then((result) => {
        if (!result) return;

        setRegion(result.region);

        requestAnimationFrame(() => {
          mapRef.current?.animateToRegion(result.region, 600);
        });
      })
      .catch((e) => {
        console.error(e);
        Alert.alert("Error", "No se pudo obtener tu ubicacion.");
      });
  }, []);

  const mapReadyPlaces: ParkingPlace[] = useMemo(() => {
    if (places.length > 0) return places;

    const lat = region?.latitude ?? 21.88234;
    const lng = region?.longitude ?? -102.28259;

    return [
      {
        id: "boot-fallback",
        name: "Estacionamiento (demo)",
        description: "Punto temporal mientras cargan los datos remotos.",
        address: "Aguascalientes",
        latitude: lat + 0.002,
        longitude: lng + 0.002,
        status: "unknown" as ParkingStatus,
        updatedAt: null,
        lastReportedAt: null,
        activeReportCount: 0,
        totalReportCount: 0,
        averageRating: null,
        ratingCount: 0,
        costType: "unknown" as const,
        currencyCode: "MXN",
        hourlyCostMin: null,
        hourlyCostMax: null,
        costNotes: null,
        capacityMin: null,
        capacityMax: null,
        capacityConfidence: "unknown" as const,
        accessType: "public" as const,
        source: "fallback" as const,
      },
    ];
  }, [places, region]);

  const selectedPlace = useMemo(() => {
    return mapReadyPlaces.find((place) => place.id === selectedPlaceId) ?? null;
  }, [mapReadyPlaces, selectedPlaceId]);

  const reportingPlace = useMemo(() => {
    return mapReadyPlaces.find((place) => place.id === reportingPlaceId) ?? null;
  }, [mapReadyPlaces, reportingPlaceId]);

  const filteredPlaces = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return mapReadyPlaces.slice(0, 8);

    return mapReadyPlaces.filter((place) => {
      const haystack = `${place.name} ${statusToLabel(place.status)}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [mapReadyPlaces, searchQuery]);

  const isSelectedPlaceSaved = selectedPlace ? savedPlaceIds.includes(selectedPlace.id) : false;

  useEffect(() => {
    if (!selectedPlaceId) return;

    requestAnimationFrame(() => {
      placeSheetRef.current?.snapToIndex(0);
      setPlaceSheetIndex(0);
    });
  }, [selectedPlaceId]);

  const onCenterPress = async () => {
    try {
      const result = await requestUserLocation();
      if (!result) return;

      setRegion(result.region);
      mapRef.current?.animateToRegion(result.region, 500);
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "No se pudo centrar el mapa.");
    }
  };

  const onRefreshPress = async () => {
    setIsLoadingPlaces(true);

    try {
      const { nextPlaces, nextReports } = await fetchMapOverviewData();
      const nextSelectedPlaceId =
        selectedPlaceId && nextPlaces.some((place) => place.id === selectedPlaceId)
          ? selectedPlaceId
          : nextPlaces[0]?.id ?? null;

      setPlaces(nextPlaces);
      setRecentReports(nextReports);
      setSelectedPlaceId(nextSelectedPlaceId);
      setReportingPlaceId((currentReportingPlaceId) =>
        currentReportingPlaceId && nextPlaces.some((place) => place.id === currentReportingPlaceId)
          ? currentReportingPlaceId
          : null
      );
      setPlaceDetailsRefreshKey((value) => value + 1);
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "No se pudo actualizar el mapa.");
    } finally {
      setIsLoadingPlaces(false);
    }
  };

  const openSearch = () => {
    setIsSearchOpen(true);
  };

  const closeSearch = () => {
    setIsSearchOpen(false);
    setSearchQuery("");
  };

  const openMenu = () => {
    setIsMenuOpen(true);
  };

  const closeMenu = () => {
    setIsMenuOpen(false);
  };

  const openPrivacyLegal = () => {
    closeMenu();

    if (onOpenPrivacyLegal) {
      onOpenPrivacyLegal();
      return;
    }

    Alert.alert("Privacidad y legal", "Esta seccion se abrira desde la navegacion principal.");
  };

  const openProfileSettings = () => {
    closeMenu();

    if (onOpenProfileSettings) {
      onOpenProfileSettings();
      return;
    }

    Alert.alert("Perfil y tema", "Esta seccion se abrira desde la navegacion principal.");
  };

  const openReportHistory = () => {
    closeMenu();

    if (onOpenReportHistory) {
      onOpenReportHistory();
      return;
    }

    Alert.alert(
      "Historial de reportes",
      "Esta seccion se abrira desde la navegacion principal."
    );
  };

  const openSavedPlaces = () => {
    closeMenu();

    if (onOpenSavedPlaces) {
      onOpenSavedPlaces();
      return;
    }

    Alert.alert(
      "Lugares guardados",
      "Esta seccion se abrira desde la navegacion principal."
    );
  };

  const handleSignOutPress = async () => {
    closeMenu();

    try {
      await onSignOut();
    } catch (error) {
      console.error(error);
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "No se pudo cerrar sesion."
      );
    }
  };

  const focusPlaceFromSearch = (place: ParkingPlace) => {
    setSelectedPlaceId(place.id);
    setReportingPlaceId(null);
    setIsSearchOpen(false);

    const nextRegion: Region = {
      latitude: place.latitude,
      longitude: place.longitude,
      latitudeDelta: 0.012,
      longitudeDelta: 0.012,
    };

    setRegion(nextRegion);
    mapRef.current?.animateToRegion(nextRegion, 450);

    requestAnimationFrame(() => {
      placeSheetRef.current?.snapToIndex(0);
      setPlaceSheetIndex(0);
    });

    setRecentSearches((prev) => {
      const next = [place.name, ...prev.filter((item) => item !== place.name)];
      return next.slice(0, 5);
    });
    setSearchQuery("");
  };

  useEffect(() => {
    if (!pendingFocusPlaceId || pendingFocusRequestId === null || pendingFocusRequestId === undefined) {
      return;
    }

    if (lastHandledFocusRequestIdRef.current === pendingFocusRequestId) {
      return;
    }

    const placeToFocus =
      mapReadyPlaces.find((place) => place.id === pendingFocusPlaceId) ?? null;

    if (!placeToFocus) {
      return;
    }

    lastHandledFocusRequestIdRef.current = pendingFocusRequestId;
    focusPlaceFromSearch(placeToFocus);
  }, [mapReadyPlaces, pendingFocusPlaceId, pendingFocusRequestId]);

  useEffect(() => {
    if (
      pendingPlaceRefreshRequestId === null ||
      pendingPlaceRefreshRequestId === undefined
    ) {
      return;
    }

    if (
      lastHandledPlaceRefreshRequestIdRef.current === pendingPlaceRefreshRequestId
    ) {
      return;
    }

    lastHandledPlaceRefreshRequestIdRef.current = pendingPlaceRefreshRequestId;

    const placeIdToRefresh = pendingFocusPlaceId ?? selectedPlaceId;
    if (!placeIdToRefresh) {
      return;
    }

    let active = true;

    fetchPlaceById(placeIdToRefresh)
      .then((latestPlace) => {
        if (!active || !latestPlace) return;

        setPlaces((prev) => {
          const alreadyExists = prev.some((place) => place.id === latestPlace.id);
          if (!alreadyExists) {
            return [latestPlace, ...prev];
          }

          return prev.map((place) =>
            place.id === latestPlace.id ? latestPlace : place
          );
        });
        setSelectedPlaceId(latestPlace.id);
      })
      .catch((error) => {
        console.error(error);
      });

    setPlaceDetailsRefreshKey((value) => value + 1);

    return () => {
      active = false;
    };
  }, [pendingFocusPlaceId, pendingPlaceRefreshRequestId, selectedPlaceId]);

  const handleToggleSavedPlace = async () => {
    if (!selectedPlace) return;

    try {
      setIsTogglingSavedPlace(true);

      const { saved, placeIds } = await toggleSavedPlaceForUser(
        currentUser.id,
        selectedPlace.id
      );

      setSavedPlaceIds(placeIds);
      Alert.alert(
        saved ? "Lugar guardado" : "Guardado actualizado",
        saved
          ? `${selectedPlace.name} se agrego a tus lugares guardados.`
          : `${selectedPlace.name} se quito de tus lugares guardados.`
      );
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "No se pudo actualizar tus lugares guardados.");
    } finally {
      setIsTogglingSavedPlace(false);
    }
  };

  const openPlaceReview = (place: ParkingPlace) => {
    setIsReviewsModalOpen(false);

    if (onOpenPlaceReview) {
      onOpenPlaceReview(place);
      return;
    }

    Alert.alert("Reseña", "Esta pantalla se abrira desde la navegacion principal.");
  };

  const openPlaceReviewsModal = () => {
    setIsReviewsModalOpen(true);
  };

  const closePlaceReviewsModal = () => {
    setIsReviewsModalOpen(false);
  };

  const onStartAddPlace = () => {
    setAddPlaceSheetIndex(1);
    setIsAddMode(true);
    setDraftPlaceCoord(null);
    setSelectedPlaceId(null);
    setReportingPlaceId(null);
    setNewPlaceDraft(createEmptyNewPlaceDraft());
  };

  const onCancelAddPlace = () => {
    setAddPlaceSheetIndex(1);
    setIsAddMode(false);
    setDraftPlaceCoord(null);
    setNewPlaceDraft(createEmptyNewPlaceDraft());
  };

  const onToggleDraftDayClosed = (day: ParkingWeekday) => {
    setNewPlaceDraft((prev) => {
      const nextIsClosed = !prev.weeklyHours[day].isClosed;
      return {
        ...prev,
        weeklyHours: {
          ...prev.weeklyHours,
          [day]: {
            open: "",
            close: "",
            isClosed: nextIsClosed,
          },
        },
      };
    });
  };

  const onChangeDraftDayHour = (
    day: ParkingWeekday,
    field: "open" | "close",
    value: string
  ) => {
    setNewPlaceDraft((prev) => ({
      ...prev,
      weeklyHours: {
        ...prev.weeklyHours,
        [day]: {
          ...prev.weeklyHours[day],
          isClosed: false,
          [field]: value,
        },
      },
    }));
  };

  const handleAddPlaceSheetChange = (index: number) => {
    setAddPlaceSheetIndex(index);

    if (index === -1) {
      onCancelAddPlace();
    }
  };

  const onSaveNewPlace = async () => {
    const coord =
      draftPlaceCoord ??
      (region
        ? { latitude: region.latitude, longitude: region.longitude }
        : { latitude: PILOT_REGION.latitude, longitude: PILOT_REGION.longitude });

    if (!coord) {
      Alert.alert("Ubicacion no disponible", "Mueve el mapa o toca una zona para agregar el lugar.");
      return;
    }

    if (!newPlaceDraft.name.trim()) {
      Alert.alert("Nombre requerido", "Escribe el nombre del estacionamiento antes de guardarlo.");
      return;
    }

    try {
      setIsSavingPlace(true);
      const { openingHours, closingHours } = buildDraftHoursPayload(newPlaceDraft);

      const createdPlace = await createParkingPlace({
        name: newPlaceDraft.name,
        address: newPlaceDraft.address,
        description: newPlaceDraft.description,
        latitude: coord.latitude,
        longitude: coord.longitude,
        openingHours,
        closingHours,
        costType: getDraftCostType(newPlaceDraft),
        hourlyCostMin: parseOptionalNumberInput(newPlaceDraft.hourlyCostMin),
        hourlyCostMax: parseOptionalNumberInput(newPlaceDraft.hourlyCostMax),
        costNotes: newPlaceDraft.costNotes,
        capacityMin: parseOptionalNumberInput(newPlaceDraft.capacityMin),
        capacityMax: parseOptionalNumberInput(newPlaceDraft.capacityMax),
        capacityConfidence: getDraftCapacityConfidence(newPlaceDraft),
        accessType: "public",
      });

      setPlaces((prev) => [createdPlace, ...prev.filter((place) => place.id !== createdPlace.id)]);
      setSelectedPlaceId(createdPlace.id);
      setSelectedPlaceReports([]);
      setIsAddMode(false);
      setDraftPlaceCoord(null);
      setNewPlaceDraft(createEmptyNewPlaceDraft());
      setPlaceSheetIndex(1);
      requestAnimationFrame(() => {
        placeSheetRef.current?.snapToIndex(1);
      });

      Alert.alert(
        "Estacionamiento guardado",
        `${createdPlace.name} ya quedo persistido en la base de datos.`
      );
    } catch (e) {
      console.error(e);
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "No se pudo guardar el estacionamiento."
      );
    } finally {
      setIsSavingPlace(false);
    }
  };

  const onStartReport = (place: ParkingPlace) => {
    setIsReviewsModalOpen(false);
    setIsAddMode(false);
    setDraftPlaceCoord(null);
    setSelectedPlaceId(place.id);
    setReportingPlaceId(place.id);
    setPlaceSheetIndex(1);
    requestAnimationFrame(() => {
      placeSheetRef.current?.snapToIndex(1);
    });
  };

  const onCancelReport = () => {
    setReportingPlaceId(null);
  };

  const submitReport = async (status: ReportStatus) => {
    if (!reportingPlace) return;

    try {
      const currentCoord =
        userCoord ??
        (
          await requestUserLocation()
        )?.coord ??
        null;

      if (!currentCoord) {
        Alert.alert("Ubicacion requerida", "Activa tu ubicacion para enviar un reporte.");
        return;
      }

      const placeCoord = {
        latitude: reportingPlace.latitude,
        longitude: reportingPlace.longitude,
      };

      const distance = distanceInMeters(currentCoord, placeCoord);
      if (distance > REPORT_RADIUS_METERS) {
        Alert.alert(
          "Muy lejos para reportar",
          `Debes estar a menos de ${REPORT_RADIUS_METERS} m del lugar. Estas a ${Math.round(distance)} m.`
        );
        return;
      }

      const createdReport = await submitParkingReport({
        placeId: reportingPlace.id,
        placeName: reportingPlace.name,
        status,
        reportedLatitude: currentCoord.latitude,
        reportedLongitude: currentCoord.longitude,
        reportedDistanceMeters: Math.round(distance),
      });
      const [latestPlace, nextRecentReports, nextPlaceHistory] = await Promise.all([
        fetchPlaceById(reportingPlace.id),
        fetchRecentReports(RECENT_REPORTS_LIMIT),
        fetchReportsForPlace(reportingPlace.id, PLACE_HISTORY_LIMIT),
      ]);

      setPlaces((prev) =>
        prev.map((place) => {
          if (place.id !== reportingPlace.id) return place;

          return (
            latestPlace ?? {
              ...place,
              status,
              updatedAt: createdReport.createdAt,
              lastReportedAt: createdReport.createdAt,
              activeReportCount: place.activeReportCount + 1,
              totalReportCount: place.totalReportCount + 1,
            }
          );
        })
      );
      setRecentReports(
        nextRecentReports.length > 0
          ? nextRecentReports
          : [createdReport, ...recentReports.filter((report) => report.id !== createdReport.id)].slice(
              0,
              RECENT_REPORTS_LIMIT
            )
      );
      setSelectedPlaceReports(
        nextPlaceHistory.length > 0 ? nextPlaceHistory : [createdReport]
      );

      setSelectedPlaceId(reportingPlace.id);
      setReportingPlaceId(null);
      setPlaceSheetIndex(1);
      requestAnimationFrame(() => {
        placeSheetRef.current?.snapToIndex(1);
      });

      Alert.alert("Reporte enviado", `${reportingPlace.name} ahora aparece como ${statusToLabel(status)}.`);
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "No se pudo enviar el reporte.");
    }
  };

  const onNavigatePress = async (place: ParkingPlace) => {
    const label = encodeURIComponent(place.name);
    const url =
      Platform.OS === "ios"
        ? `http://maps.apple.com/?ll=${place.latitude},${place.longitude}&q=${label}`
        : `geo:${place.latitude},${place.longitude}?q=${place.latitude},${place.longitude}(${label})`;

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        await Linking.openURL(
          `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`
        );
      }
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "No se pudo abrir la navegacion.");
    }
  };

  if (permission === "denied") {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Permiso de ubicacion requerido</Text>
        <Text style={styles.subtitle}>Activa ubicacion para ver estacionamientos cerca de ti.</Text>
      </View>
    );
  }

  const initialRegion: Region = region ?? PILOT_REGION;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        onPress={(e) => {
          if (ignoreNextMapPressRef.current) {
            ignoreNextMapPressRef.current = false;
            return;
          }

          if (isAddMode) {
            setDraftPlaceCoord(e.nativeEvent.coordinate);
            return;
          }
          setSelectedPlaceId(null);
          setReportingPlaceId(null);
        }}
        onRegionChangeComplete={(nextRegion) => setRegion(nextRegion)}
        showsUserLocation={permission === "granted"}
        showsMyLocationButton={false}
      >
        {mapReadyPlaces.map((place) => (
          <Marker
            key={place.id}
            coordinate={{
              latitude: place.latitude,
              longitude: place.longitude,
            }}
            pinColor={statusToColor(place.status)}
            title={place.name}
            description={`Estado: ${statusToLabel(place.status)}`}
            onPress={() => {
              ignoreNextMapPressRef.current = true;
              setSelectedPlaceId(place.id);
              setReportingPlaceId(null);
              setPlaceSheetIndex(0);
              requestAnimationFrame(() => {
                placeSheetRef.current?.snapToIndex(0);
              });
            }}
          />
        ))}

        {draftPlaceCoord ? (
          <Marker
            coordinate={draftPlaceCoord}
            title="Nuevo estacionamiento"
            description="Ubicacion propuesta"
            pinColor="#0ea5e9"
          />
        ) : null}
      </MapView>

      <View style={styles.topBar}>
        <Pressable testID="open-menu-button" style={styles.menuButton} onPress={openMenu}>
          <Text style={styles.menuButtonIcon}>≡</Text>
        </Pressable>

        <Pressable style={styles.searchBar} onPress={openSearch}>
          <Text style={styles.searchIcon}>⌕</Text>
          <View style={styles.searchCopy}>
            <Text style={styles.searchTitle}>Buscar estacionamiento</Text>
            <Text style={styles.searchSubtitle}>Centro, plaza, calle o colonia</Text>
          </View>
          <Text style={styles.searchMic}>◉</Text>
        </Pressable>
      </View>

      <View style={styles.legendDock}>
        <Text style={styles.legendDockTitle}>Estado en vivo</Text>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: "#16a34a" }]} />
            <Text style={styles.legendText}>Disponible</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: "#ef4444" }]} />
            <Text style={styles.legendText}>Lleno</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: "#475569" }]} />
            <Text style={styles.legendText}>Cerrado</Text>
          </View>
        </View>
      </View>

      <View style={styles.fabColumn}>
        <Pressable
          style={[styles.fab, styles.fabDark]}
          onPress={() => Alert.alert("Proximo paso", "Aqui podemos poner acceso rapido para validar o reportar incidencias.")}
        >
          <Text style={styles.fabDarkIcon}>!</Text>
        </Pressable>

        <Pressable
          testID="toggle-add-place-button"
          style={[styles.fab, styles.fabPrimary, isAddMode && styles.fabPrimaryActive]}
          onPress={isAddMode ? onCancelAddPlace : onStartAddPlace}
        >
          <Text style={styles.fabPrimaryIcon}>{isAddMode ? "x" : "+"}</Text>
        </Pressable>

        <Pressable
          testID="refresh-map-button"
          style={[styles.fab, styles.fabSecondary, isLoadingPlaces && styles.fabDisabled]}
          onPress={onRefreshPress}
          disabled={isLoadingPlaces}
        >
          <Text style={styles.fabRefreshIcon}>↻</Text>
        </Pressable>

        <Pressable style={[styles.fab, styles.fabSecondary]} onPress={onCenterPress}>
          <Text style={styles.fabSecondaryIcon}>◎</Text>
        </Pressable>
      </View>

      {isAddMode ? (
        <BottomSheet
          ref={addPlaceSheetRef}
          index={addPlaceSheetIndex}
          snapPoints={addPlaceSheetSnapPoints}
          enablePanDownToClose
          enableContentPanningGesture
          enableOverDrag={false}
          animateOnMount={false}
          backgroundStyle={styles.bottomSheetBackground}
          handleIndicatorStyle={styles.bottomSheetHandleIndicator}
          onChange={handleAddPlaceSheetChange}
        >
          <View style={styles.sheetHeaderBlock}>
            <Text style={styles.sheetTitle}>Agregar estacionamiento</Text>
            <Text style={styles.sheetSubtitle}>
              Toca el mapa para fijar ubicacion y completa los datos clave.
            </Text>
          </View>
          <BottomSheetScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetScrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.sheetHeroDraft}>
              <Text style={styles.sheetHeroDraftLabel}>Nuevo punto comunitario</Text>
              <Text style={styles.sheetHeroDraftMeta}>
                Guardamos nombre, coordenadas, costo y capacidad estimada para que el lugar quede disponible para todos.
              </Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Nombre</Text>
              <TextInput
                testID="new-place-name-input"
                value={newPlaceDraft.name}
                onChangeText={(value) =>
                  setNewPlaceDraft((prev) => ({ ...prev, name: value }))
                }
                placeholder="Nombre del estacionamiento"
                placeholderTextColor="#94a3b8"
                style={styles.textField}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Referencia</Text>
              <TextInput
                value={newPlaceDraft.address}
                onChangeText={(value) =>
                  setNewPlaceDraft((prev) => ({ ...prev, address: value }))
                }
                placeholder="Direccion o referencia"
                placeholderTextColor="#94a3b8"
                style={styles.textField}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Descripcion</Text>
              <TextInput
                value={newPlaceDraft.description}
                onChangeText={(value) =>
                  setNewPlaceDraft((prev) => ({ ...prev, description: value }))
                }
                placeholder="Descripcion breve del lugar"
                placeholderTextColor="#94a3b8"
                style={[styles.textField, styles.textFieldMultiline]}
                multiline
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Horario semanal</Text>
              <Text style={styles.formHelperText}>
                Usa formato HH:MM. Si un dia no abre, marcalo como cerrado.
              </Text>
              <View style={styles.scheduleCard}>
                {PARKING_WEEKDAYS.map((day) => {
                  const dayDraft = newPlaceDraft.weeklyHours[day];
                  return (
                    <View key={day} style={styles.scheduleRow}>
                      <View style={styles.scheduleRowHeader}>
                        <Text style={styles.scheduleDayLabel}>
                          {PARKING_WEEKDAY_LABELS[day]}
                        </Text>
                        <Pressable
                          testID={`new-place-${day}-closed-toggle`}
                          style={[
                            styles.scheduleClosedChip,
                            dayDraft.isClosed && styles.scheduleClosedChipActive,
                          ]}
                          onPress={() => onToggleDraftDayClosed(day)}
                        >
                          <Text
                            style={[
                              styles.scheduleClosedChipText,
                              dayDraft.isClosed && styles.scheduleClosedChipTextActive,
                            ]}
                          >
                            {dayDraft.isClosed ? "Cerrado" : "Abierto"}
                          </Text>
                        </Pressable>
                      </View>

                      {dayDraft.isClosed ? (
                        <Text style={styles.scheduleClosedHint}>
                          Sin atencion ese dia.
                        </Text>
                      ) : (
                        <View style={styles.formRow}>
                          <View style={styles.formColumn}>
                            <Text style={styles.inputLabel}>Abre</Text>
                            <TextInput
                              testID={`new-place-${day}-open-input`}
                              value={dayDraft.open}
                              onChangeText={(value) =>
                                onChangeDraftDayHour(day, "open", value)
                              }
                              placeholder="08:00"
                              placeholderTextColor="#94a3b8"
                              autoCapitalize="none"
                              keyboardType="numbers-and-punctuation"
                              maxLength={5}
                              style={styles.textField}
                            />
                          </View>
                          <View style={styles.formColumn}>
                            <Text style={styles.inputLabel}>Cierra</Text>
                            <TextInput
                              testID={`new-place-${day}-close-input`}
                              value={dayDraft.close}
                              onChangeText={(value) =>
                                onChangeDraftDayHour(day, "close", value)
                              }
                              placeholder="22:00"
                              placeholderTextColor="#94a3b8"
                              autoCapitalize="none"
                              keyboardType="numbers-and-punctuation"
                              maxLength={5}
                              style={styles.textField}
                            />
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={styles.formRow}>
              <View style={styles.formColumn}>
                <Text style={styles.inputLabel}>Costo min/h</Text>
                <TextInput
                  value={newPlaceDraft.hourlyCostMin}
                  onChangeText={(value) =>
                    setNewPlaceDraft((prev) => ({ ...prev, hourlyCostMin: value }))
                  }
                  placeholder="20"
                  placeholderTextColor="#94a3b8"
                  keyboardType="decimal-pad"
                  style={styles.textField}
                />
              </View>
              <View style={styles.formColumn}>
                <Text style={styles.inputLabel}>Costo max/h</Text>
                <TextInput
                  value={newPlaceDraft.hourlyCostMax}
                  onChangeText={(value) =>
                    setNewPlaceDraft((prev) => ({ ...prev, hourlyCostMax: value }))
                  }
                  placeholder="30"
                  placeholderTextColor="#94a3b8"
                  keyboardType="decimal-pad"
                  style={styles.textField}
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Notas de costo</Text>
              <TextInput
                value={newPlaceDraft.costNotes}
                onChangeText={(value) =>
                  setNewPlaceDraft((prev) => ({ ...prev, costNotes: value }))
                }
                placeholder="Ej. tarifa variable por evento"
                placeholderTextColor="#94a3b8"
                style={styles.textField}
              />
            </View>

            <View style={styles.formRow}>
              <View style={styles.formColumn}>
                <Text style={styles.inputLabel}>Capacidad min</Text>
                <TextInput
                  value={newPlaceDraft.capacityMin}
                  onChangeText={(value) =>
                    setNewPlaceDraft((prev) => ({ ...prev, capacityMin: value }))
                  }
                  placeholder="40"
                  placeholderTextColor="#94a3b8"
                  keyboardType="number-pad"
                  style={styles.textField}
                />
              </View>
              <View style={styles.formColumn}>
                <Text style={styles.inputLabel}>Capacidad max</Text>
                <TextInput
                  value={newPlaceDraft.capacityMax}
                  onChangeText={(value) =>
                    setNewPlaceDraft((prev) => ({ ...prev, capacityMax: value }))
                  }
                  placeholder="80"
                  placeholderTextColor="#94a3b8"
                  keyboardType="number-pad"
                  style={styles.textField}
                />
              </View>
            </View>

            <Text style={styles.coordinateHint}>
              Coordenadas a guardar:{" "}
              {(draftPlaceCoord ?? region)
                ? `${(draftPlaceCoord ?? region)!.latitude.toFixed(5)}, ${(draftPlaceCoord ?? region)!.longitude.toFixed(5)}`
                : "mueve el mapa para fijarlas"}
            </Text>
            <View style={styles.sheetActions}>
              <Pressable style={[styles.actionBtn, styles.actionGhost]} onPress={onCancelAddPlace}>
                <Text style={styles.actionGhostText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, styles.actionPrimary]}
                onPress={onSaveNewPlace}
                disabled={isSavingPlace}
              >
                <Text style={styles.actionPrimaryText}>
                  {isSavingPlace ? "Guardando..." : "Guardar lugar"}
                </Text>
              </Pressable>
            </View>
          </BottomSheetScrollView>
        </BottomSheet>
      ) : reportingPlace ? (
        <View style={[styles.sheet, styles.sheetExpanded]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Reportar estado</Text>
          <Text style={styles.sheetSubtitle} numberOfLines={1}>
            {reportingPlace.name}
          </Text>
          <Text style={styles.sheetMeta}>
            Solo puedes reportar si estas cerca del lugar ({REPORT_RADIUS_METERS} m max).
          </Text>

          <View style={styles.validationPanel}>
            <Text style={styles.validationTitle}>Validar estacionamiento</Text>
            <Text style={styles.validationBody}>
              Este bloque esta pensado para futuras fotos, notas y confirmaciones de la comunidad.
            </Text>
          </View>

          <View style={styles.reportOptions}>
            <Pressable
              testID="report-status-available"
              style={[styles.reportOption, { backgroundColor: "#16a34a" }]}
              onPress={() => submitReport("available")}
            >
              <Text style={styles.reportOptionText}>Disponible</Text>
            </Pressable>
            <Pressable
              testID="report-status-full"
              style={[styles.reportOption, { backgroundColor: "#ef4444" }]}
              onPress={() => submitReport("full")}
            >
              <Text style={styles.reportOptionText}>Lleno</Text>
            </Pressable>
            <Pressable
              testID="report-status-closed"
              style={[styles.reportOption, { backgroundColor: "#475569" }]}
              onPress={() => submitReport("closed")}
            >
              <Text style={styles.reportOptionText}>Cerrado</Text>
            </Pressable>
          </View>

          <Pressable style={[styles.actionBtn, styles.actionGhost, styles.reportCancel]} onPress={onCancelReport}>
            <Text style={styles.actionGhostText}>Cancelar</Text>
          </Pressable>
        </View>
      ) : selectedPlace ? (
        <BottomSheet
          ref={placeSheetRef}
          index={0}
          snapPoints={placeSheetSnapPoints}
          enablePanDownToClose={false}
          enableContentPanningGesture
          enableOverDrag={false}
          animateOnMount={false}
          backgroundStyle={styles.bottomSheetBackground}
          handleIndicatorStyle={styles.bottomSheetHandleIndicator}
          onChange={(index) => setPlaceSheetIndex(index)}
        >
          <View style={styles.placeSheetHeader}>
            <View style={styles.placeHeaderCopy}>
              <Text style={styles.sheetEyebrow}>Aguascalientes piloto</Text>
              <Text style={styles.placeTitle} numberOfLines={isPlaceSheetExpanded ? 2 : 1}>
                {selectedPlace.name}
              </Text>
              <Text style={styles.placeSubtitle}>
                {selectedPlace.source === "remote" ? "Ubicacion validada por comunidad" : "Punto agregado en este dispositivo"}
                {isLoadingPlaces ? " . Cargando..." : ""}
              </Text>
            </View>

            <View style={styles.placeHeaderAside}>
              <Pressable style={styles.mapPeekButton} onPress={() => placeSheetRef.current?.snapToIndex(0)}>
                <Text style={styles.mapPeekButtonText}>Mapa</Text>
              </Pressable>
              <View
                style={[
                  styles.statusPill,
                  { backgroundColor: `${statusToColor(selectedPlace.status)}22` },
                ]}
              >
                <Text style={[styles.statusPillText, { color: statusToColor(selectedPlace.status) }]}>
                  {statusToLabel(selectedPlace.status)}
                </Text>
              </View>
            </View>
          </View>

          <BottomSheetScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetScrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.placeHero}>
              <View style={[styles.placeHeroBadge, { backgroundColor: statusToColor(selectedPlace.status) }]}>
                <Text style={styles.placeHeroBadgeText}>{statusToLabel(selectedPlace.status)}</Text>
              </View>
              <Text style={styles.placeHeroTitle}>{getStatusSupportLabel(selectedPlace.status)}</Text>
              <Text style={styles.placeHeroMeta}>{getUpdatedLabel(selectedPlace)}</Text>
            </View>

            <View style={styles.primaryActionsRow}>
              <Pressable
                style={[styles.primaryActionCard, styles.primaryActionAccent]}
                onPress={() => onNavigatePress(selectedPlace)}
              >
                <Text style={[styles.primaryActionEmoji, styles.primaryActionEmojiOnDark]}>➜</Text>
                <Text style={[styles.primaryActionTitle, styles.primaryActionTitleOnDark]}>Como llegar</Text>
                <Text style={[styles.primaryActionBody, styles.primaryActionBodyOnDark]}>Abrir navegacion externa</Text>
              </Pressable>

              <Pressable
                testID="validate-place-button"
                style={[styles.primaryActionCard, styles.primaryActionSoft]}
                onPress={() => onStartReport(selectedPlace)}
              >
                <Text style={[styles.primaryActionEmoji, styles.primaryActionEmojiSoft]}>✓</Text>
                <Text style={styles.primaryActionTitle}>Validar</Text>
                <Text style={styles.primaryActionBody}>Confirmar si hay espacio</Text>
              </Pressable>
            </View>

            <View style={styles.detailsGrid}>
              <Pressable
                testID="open-place-reviews-button"
                style={[styles.detailTile, styles.detailTilePressable]}
                onPress={openPlaceReviewsModal}
              >
                <Text style={styles.detailLabel}>Calificacion</Text>
                <View style={styles.ratingBadgeRow}>
                  <Text style={styles.detailValue}>
                    {formatRatingBadgeSummary(selectedPlace)}
                  </Text>
                  <Text style={styles.ratingBadgeStar}>{"\u2605"}</Text>
                </View>
                <Text style={styles.detailHint}>
                  {selectedPlace.ratingCount > 0
                    ? "Toca para ver reseñas"
                    : "Toca para abrir las reseñas"}
                </Text>
              </Pressable>
              <View style={styles.detailTile}>
                <Text style={styles.detailLabel}>Capacidad</Text>
                <Text style={styles.detailValue}>{formatCapacitySummary(selectedPlace)}</Text>
              </View>
              <View style={styles.detailTile}>
                <Text style={styles.detailLabel}>Costo</Text>
                <Text style={styles.detailValue}>{formatCostSummary(selectedPlace)}</Text>
              </View>
              <View style={styles.detailTile}>
                <Text style={styles.detailLabel}>Acceso</Text>
                <Text style={styles.detailValue}>{getAccessTypeLabel(selectedPlace.accessType)}</Text>
              </View>
            </View>

            <View style={styles.hoursSection}>
              <View style={styles.photoHeaderRow}>
                <Text style={styles.sectionTitle}>Horario semanal</Text>
                <Text style={styles.sectionAction}>{getTodayHoursSummary(selectedPlace)}</Text>
              </View>
              <View style={styles.hoursCard}>
                {PARKING_WEEKDAYS.map((day) => {
                  const dayHours = getParkingDayHours(
                    selectedPlace.openingHours,
                    selectedPlace.closingHours,
                    day
                  );
                  const value =
                    dayHours.status === "open"
                      ? `${dayHours.opensAt} - ${dayHours.closesAt}`
                      : dayHours.status === "closed"
                        ? "Cerrado"
                        : "Por validar";

                  return (
                    <View key={day} style={styles.hoursRow}>
                      <Text style={styles.hoursDayLabel}>{PARKING_WEEKDAY_LABELS[day]}</Text>
                      <Text
                        style={[
                          styles.hoursValue,
                          dayHours.status === "closed" && styles.hoursValueClosed,
                          dayHours.status === "unknown" && styles.hoursValueUnknown,
                        ]}
                      >
                        {value}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={styles.historySection}>
              <View style={styles.photoHeaderRow}>
                <Text style={styles.sectionTitle}>Historial reciente</Text>
                <Text style={styles.sectionAction}>
                  {isLoadingPlaceHistory
                    ? "Cargando..."
                    : formatReportVolumeSummary(selectedPlace)}
                </Text>
              </View>
              {selectedPlaceReports.length > 0 ? (
                selectedPlaceReports.map((report) => (
                  <View key={report.id} style={styles.historyRow}>
                    <View
                      style={[
                        styles.historyStatus,
                        { backgroundColor: `${statusToColor(report.status)}22` },
                      ]}
                    >
                      <Text
                        style={[
                          styles.historyStatusText,
                          { color: statusToColor(report.status) },
                        ]}
                      >
                        {statusToLabel(report.status)}
                      </Text>
                    </View>
                    <View style={styles.historyCopy}>
                      <Text style={styles.historyTitle}>
                        {report.reporterDisplayName ?? "Comunidad"}
                      </Text>
                      <Text style={styles.historySubtitle}>
                        {getElapsedLabel(report.createdAt) ?? "Reciente"}
                        {report.note ? ` . ${report.note}` : ""}
                      </Text>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.menuEmptyText}>
                  Aun no hay reportes recientes para este estacionamiento.
                </Text>
              )}
            </View>

            <View style={styles.infoSection}>
              <Text style={styles.sectionTitle}>Sobre este lugar</Text>
              <Text style={styles.infoBody}>
                {selectedPlace.description ??
                  "Lugar comunitario dentro del piloto de Aguascalientes."}
                {"\n\n"}Referencia: {selectedPlace.address ?? "Por validar"}.
                {"\n"}Coordenadas: {selectedPlace.latitude.toFixed(5)},{" "}
                {selectedPlace.longitude.toFixed(5)}.
                {"\n"}Notas: {selectedPlace.costNotes ?? "Sin notas adicionales."}
              </Text>
            </View>

            <View style={styles.sheetActions}>
              <Pressable
                testID="toggle-save-place-button"
                style={[
                  styles.actionBtn,
                  isSelectedPlaceSaved ? styles.actionSuccess : styles.actionGhost,
                  (isLoadingSavedPlaces || isTogglingSavedPlace) && styles.actionDisabled,
                ]}
                onPress={handleToggleSavedPlace}
                disabled={isLoadingSavedPlaces || isTogglingSavedPlace}
              >
                <Text
                  style={
                    isSelectedPlaceSaved ? styles.actionSuccessText : styles.actionGhostText
                  }
                >
                  {isLoadingSavedPlaces
                    ? "Cargando..."
                    : isTogglingSavedPlace
                      ? "Guardando..."
                      : isSelectedPlaceSaved
                        ? "Quitar guardado"
                        : "Guardar"}
                </Text>
              </Pressable>
              <Pressable
                testID="open-place-review-button"
                style={[styles.actionBtn, styles.actionPrimary]}
                onPress={() => openPlaceReview(selectedPlace)}
              >
                <Text style={styles.actionPrimaryText}>Escribir reseña</Text>
              </Pressable>
            </View>
          </BottomSheetScrollView>
        </BottomSheet>
      ) : (
        <View style={[styles.sheet, styles.sheetPeek, styles.sheetHint]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetHintText}>
            Toca un marcador para abrir la ficha completa o usa + para agregar uno nuevo.
          </Text>
        </View>
      )}

      <Modal
        visible={Boolean(selectedPlace) && isReviewsModalOpen}
        animationType="slide"
        transparent
        onRequestClose={closePlaceReviewsModal}
      >
        <View style={styles.reviewsModalBackdrop}>
          <Pressable
            style={styles.reviewsModalDismissArea}
            onPress={closePlaceReviewsModal}
          />

          {selectedPlace ? (
            <View style={styles.reviewsModalCard}>
              <View style={styles.reviewsModalHeader}>
                <View style={styles.reviewsModalHeaderCopy}>
                  <Text style={styles.sectionTitle}>Reseñas</Text>
                  <Text style={styles.sheetSubtitle} numberOfLines={1}>
                    {selectedPlace.name}
                  </Text>
                  <View style={styles.reviewsSummaryRow}>
                    <Text style={styles.reviewsSummaryText}>
                      {formatRatingBadgeSummary(selectedPlace)}
                    </Text>
                    <Text style={styles.ratingBadgeStar}>{"\u2605"}</Text>
                  </View>
                </View>

                <Pressable
                  testID="close-place-reviews-button"
                  style={styles.mapPeekButton}
                  onPress={closePlaceReviewsModal}
                >
                  <Text style={styles.mapPeekButtonText}>Cerrar</Text>
                </Pressable>
              </View>

              {isLoadingPlaceReviews ? (
                <View style={styles.reviewsLoadingState}>
                  <ActivityIndicator size="small" color="#0891b2" />
                  <Text style={styles.reviewsLoadingText}>Cargando reseñas...</Text>
                </View>
              ) : selectedPlaceReviews.length > 0 ? (
                <ScrollView
                  style={styles.reviewsScroll}
                  contentContainerStyle={styles.reviewsScrollContent}
                  showsVerticalScrollIndicator={false}
                >
                  {selectedPlaceReviews.map((review) => (
                    <View key={review.id} style={styles.reviewCard}>
                      <View style={styles.reviewCardHeader}>
                        <View style={styles.reviewAvatar}>
                          <Text style={styles.reviewAvatarText}>
                            {getInitialsFromLabel(
                              review.reviewerDisplayName ?? "Comunidad"
                            )}
                          </Text>
                        </View>
                        <View style={styles.reviewCardCopy}>
                          <Text style={styles.reviewAuthor}>
                            {review.reviewerDisplayName ?? "Comunidad"}
                          </Text>
                          <Text style={styles.reviewTimestamp}>
                            {getElapsedLabel(review.updatedAt ?? review.createdAt) ??
                              "Reciente"}
                          </Text>
                        </View>
                      </View>

                      <StarRatingRow value={review.rating} size={18} />
                      <Text style={styles.reviewBody}>
                        {review.comment ?? "Sin comentario adicional."}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <View style={styles.reviewsEmptyState}>
                  <Text style={styles.reviewsEmptyTitle}>
                    Aun no hay reseñas para este estacionamiento.
                  </Text>
                  <Text style={styles.reviewsEmptyBody}>
                    Usa &quot;Escribir reseña&quot; para compartir la primera experiencia
                    de la comunidad.
                  </Text>
                </View>
              )}
            </View>
          ) : null}
        </View>
      </Modal>

      <Modal visible={isSearchOpen} animationType="fade" transparent onRequestClose={closeSearch}>
        <KeyboardAvoidingView
          style={styles.searchModalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={styles.searchModalDismissArea} onPress={closeSearch} />

          <View style={styles.searchModalCard}>
            <View style={styles.searchModalTopRow}>
              <View style={styles.searchInputWrap}>
                <Text style={styles.searchInputIcon}>⌕</Text>
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Buscar zona, plaza o estacionamiento"
                  placeholderTextColor="#94a3b8"
                  autoFocus
                  style={styles.searchInput}
                />
              </View>
              <Pressable style={styles.searchCloseBtn} onPress={closeSearch}>
                <Text style={styles.searchCloseBtnText}>Cerrar</Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.searchScroll}
              contentContainerStyle={styles.searchScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.searchChipsRow}>
                <View style={styles.searchChip}>
                  <Text style={styles.searchChipText}>Centro</Text>
                </View>
                <View style={styles.searchChip}>
                  <Text style={styles.searchChipText}>Plazas</Text>
                </View>
                <View style={styles.searchChip}>
                  <Text style={styles.searchChipText}>Publicos</Text>
                </View>
              </View>

              {!searchQuery.trim() ? (
                <View style={styles.recentSection}>
                  <Text style={styles.searchSectionTitle}>Busquedas recientes</Text>
                  {recentSearches.map((item) => (
                    <Pressable
                      key={item}
                      style={styles.recentRow}
                      onPress={() => setSearchQuery(item)}
                    >
                      <Text style={styles.recentRowIcon}>↺</Text>
                      <Text style={styles.recentRowText}>{item}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <View style={styles.resultsSection}>
                <Text style={styles.searchSectionTitle}>
                  {searchQuery.trim() ? "Resultados" : "Estacionamientos cercanos"}
                </Text>

                {filteredPlaces.length > 0 ? (
                  filteredPlaces.map((place) => (
                    <Pressable
                      key={place.id}
                      style={styles.resultRow}
                      onPress={() => focusPlaceFromSearch(place)}
                    >
                      <View
                        style={[
                          styles.resultDot,
                          { backgroundColor: statusToColor(place.status) },
                        ]}
                      />
                      <View style={styles.resultCopy}>
                        <Text style={styles.resultTitle}>{place.name}</Text>
                        <Text style={styles.resultSubtitle}>
                          {statusToLabel(place.status)} . {getUpdatedLabel(place)}
                        </Text>
                      </View>
                      <Text style={styles.resultAction}>Ver</Text>
                    </Pressable>
                  ))
                ) : (
                  <View style={styles.emptySearchState}>
                    <Text style={styles.emptySearchTitle}>Sin coincidencias</Text>
                    <Text style={styles.emptySearchBody}>
                      Prueba con otra colonia, plaza o nombre de estacionamiento.
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={isMenuOpen} animationType="fade" transparent onRequestClose={closeMenu}>
        <View style={styles.menuBackdrop}>
          <View style={styles.menuPanel}>
            <View style={styles.menuProfileCard}>
              <View style={styles.menuAvatar}>
                {currentUser.avatarUrl ? (
                  <Image
                    source={{ uri: currentUser.avatarUrl }}
                    style={styles.menuAvatarImage}
                  />
                ) : (
                  <Text style={styles.menuAvatarText}>{getUserInitials(currentUser)}</Text>
                )}
              </View>
              <View style={styles.menuProfileCopy}>
                <Text style={styles.menuProfileTitle}>{getUserDisplayName(currentUser)}</Text>
                <Text style={styles.menuProfileSubtitle}>
                  {currentUser.email}
                  {currentUser.phone ? `\n${currentUser.phone}` : ""}
                </Text>
              </View>
              <Pressable
                testID="sign-out-button"
                style={styles.menuPrimaryBtn}
                onPress={handleSignOutPress}
              >
                <Text style={styles.menuPrimaryBtnText}>Cerrar sesion</Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.menuScroll}
              contentContainerStyle={styles.menuScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.menuSection}>
                <Text style={styles.menuSectionTitle}>Tu cuenta</Text>
                <Pressable
                  testID="open-profile-settings-button"
                  style={styles.menuActionRow}
                  onPress={openProfileSettings}
                >
                  <Text style={styles.menuActionIcon}>◐</Text>
                  <View style={styles.menuActionCopy}>
                    <Text style={styles.menuActionTitle}>Perfil y tema</Text>
                    <Text style={styles.menuActionSubtitle}>Edita tu nombre visible, telefono y estilo</Text>
                  </View>
                </Pressable>
              </View>

              <View style={styles.menuSection}>
                <Text style={styles.menuSectionTitle}>Tu actividad</Text>
                <Pressable
                  style={styles.menuActionRow}
                  testID="open-report-history-button"
                  onPress={openReportHistory}
                >
                  <Text style={styles.menuActionIcon}>✓</Text>
                  <View style={styles.menuActionCopy}>
                    <Text style={styles.menuActionTitle}>Historial de reportes</Text>
                    <Text style={styles.menuActionSubtitle}>Tus ultimas validaciones y estados enviados</Text>
                  </View>
                </Pressable>

                <Pressable
                  style={styles.menuActionRow}
                  testID="open-saved-places-button"
                  onPress={openSavedPlaces}
                >
                  <Text style={styles.menuActionIcon}>★</Text>
                  <View style={styles.menuActionCopy}>
                    <Text style={styles.menuActionTitle}>Lugares guardados</Text>
                    <Text style={styles.menuActionSubtitle}>Acceso rapido a tus estacionamientos frecuentes</Text>
                  </View>
                </Pressable>
              </View>

              <View style={styles.menuSection}>
                <Text style={styles.menuSectionTitle}>Reportes recientes</Text>
                {recentReports.length > 0 ? (
                  recentReports.map((report) => (
                    <View key={report.id} style={styles.menuReportRow}>
                      <View
                        style={[
                          styles.menuReportStatus,
                          { backgroundColor: `${statusToColor(report.status)}22` },
                        ]}
                      >
                        <Text
                          style={[
                            styles.menuReportStatusText,
                            { color: statusToColor(report.status) },
                          ]}
                        >
                          {statusToLabel(report.status)}
                        </Text>
                      </View>
                      <View style={styles.menuReportCopy}>
                        <Text style={styles.menuReportTitle}>{report.placeName}</Text>
                        <Text style={styles.menuReportSubtitle}>
                          {getElapsedLabel(report.createdAt) ?? "Reciente"}
                        </Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={styles.menuEmptyText}>Aun no hay reportes recientes.</Text>
                )}
              </View>

              <View style={styles.menuSection}>
                <Text style={styles.menuSectionTitle}>Ajustes</Text>
                <Pressable
                  testID="open-privacy-legal-button"
                  style={styles.menuActionRow}
                  onPress={openPrivacyLegal}
                >
                  <Text style={styles.menuActionIcon}>⚙</Text>
                  <View style={styles.menuActionCopy}>
                    <Text style={styles.menuActionTitle}>Privacidad y legal</Text>
                    <Text style={styles.menuActionSubtitle}>Ubicacion, uso de datos y alcance de la demo</Text>
                  </View>
                </Pressable>
              </View>
            </ScrollView>
          </View>

          <Pressable style={styles.menuDismissArea} onPress={closeMenu} />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  topBar: {
    position: "absolute",
    left: 12,
    right: 12,
    top: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  menuButton: {
    width: 52,
    height: 52,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  menuButtonIcon: { fontSize: 24, lineHeight: 24, color: "#0f172a", fontWeight: "800" },
  searchBar: {
    flex: 1,
    minHeight: 52,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderRadius: 18,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  searchIcon: { fontSize: 18, color: "#0f172a" },
  searchCopy: { flex: 1, marginLeft: 10 },
  searchTitle: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  searchSubtitle: { marginTop: 1, fontSize: 12, color: "#64748b", fontWeight: "500" },
  searchMic: { fontSize: 18, color: "#0891b2", fontWeight: "800" },
  legendDock: {
    position: "absolute",
    left: 12,
    top: 76,
    backgroundColor: "rgba(15,23,42,0.86)",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  legendDockTitle: { fontSize: 11, color: "#cbd5e1", fontWeight: "700", textTransform: "uppercase" },
  legendRow: { marginTop: 10, flexDirection: "row", gap: 14 },
  legendItem: { flexDirection: "row", alignItems: "center" },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  legendText: { fontSize: 12, color: "#f8fafc", fontWeight: "700" },
  fabColumn: {
    position: "absolute",
    right: 16,
    bottom: 280,
    gap: 10,
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 7,
  },
  fabDark: { backgroundColor: "#0f172a" },
  fabDarkIcon: { color: "#ffffff", fontSize: 22, fontWeight: "900" },
  fabPrimary: { backgroundColor: "#0ea5e9" },
  fabPrimaryActive: { backgroundColor: "#ef4444" },
  fabSecondary: { backgroundColor: "#ffffff" },
  fabDisabled: { opacity: 0.62 },
  fabPrimaryIcon: {
    color: "white",
    fontSize: 30,
    lineHeight: 30,
    marginTop: -2,
    fontWeight: "700",
  },
  fabRefreshIcon: { color: "#0f172a", fontSize: 22, fontWeight: "800" },
  fabSecondaryIcon: { color: "#0f172a", fontSize: 20, fontWeight: "800" },
  sheet: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: "#f8fafc",
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: "#0f172a",
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 9,
  },
  bottomSheetBackground: {
    backgroundColor: "#f8fafc",
    borderRadius: 28,
  },
  bottomSheetHandleIndicator: {
    backgroundColor: "#cbd5e1",
    width: 44,
    height: 5,
  },
  sheetScroll: { flex: 1 },
  sheetScrollContent: { paddingHorizontal: 14, paddingBottom: 16 },
  sheetPeek: { minHeight: 170 },
  sheetExpanded: { minHeight: 360, maxHeight: "72%" },
  sheetHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#cbd5e1",
    marginBottom: 10,
  },
  sheetHeaderBlock: { paddingHorizontal: 14, paddingTop: 4 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: { fontSize: 17, fontWeight: "800", color: "#0f172a", maxWidth: "70%" },
  sheetSubtitle: { marginTop: 4, fontSize: 13, color: "#475569", fontWeight: "500" },
  sheetMeta: { marginTop: 2, fontSize: 12, color: "#94a3b8" },
  sheetEyebrow: { fontSize: 11, color: "#0891b2", fontWeight: "800", textTransform: "uppercase" },
  placeSheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 4,
  },
  placeHeaderCopy: { flex: 1 },
  placeHeaderAside: { alignItems: "flex-end", gap: 8 },
  mapPeekButton: {
    backgroundColor: "#e2e8f0",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  mapPeekButtonText: { fontSize: 12, color: "#0f172a", fontWeight: "800" },
  placeTitle: { marginTop: 4, fontSize: 28, lineHeight: 31, fontWeight: "900", color: "#0f172a" },
  placeSubtitle: { marginTop: 4, fontSize: 13, color: "#64748b", fontWeight: "500" },
  placeHero: {
    marginTop: 16,
    backgroundColor: "#e0f2fe",
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "#bae6fd",
  },
  placeHeroBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  placeHeroBadgeText: { color: "#ffffff", fontSize: 12, fontWeight: "900" },
  placeHeroTitle: { marginTop: 10, fontSize: 18, lineHeight: 22, fontWeight: "800", color: "#082f49" },
  placeHeroMeta: { marginTop: 6, fontSize: 13, color: "#0f766e", fontWeight: "600" },
  primaryActionsRow: { marginTop: 14, flexDirection: "row", gap: 10 },
  primaryActionCard: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  primaryActionAccent: { backgroundColor: "#0f172a" },
  primaryActionSoft: { backgroundColor: "#ecfeff", borderWidth: 1, borderColor: "#bae6fd" },
  primaryActionEmoji: { fontSize: 20, fontWeight: "800" },
  primaryActionEmojiOnDark: { color: "#ffffff" },
  primaryActionEmojiSoft: { color: "#0891b2" },
  primaryActionTitle: { marginTop: 8, fontSize: 15, fontWeight: "800", color: "#0f172a" },
  primaryActionTitleOnDark: { color: "#ffffff" },
  primaryActionBody: { marginTop: 4, fontSize: 12, lineHeight: 16, color: "#64748b", fontWeight: "500" },
  primaryActionBodyOnDark: { color: "#cbd5e1" },
  detailsGrid: { marginTop: 16, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  detailTile: {
    width: "48%",
    backgroundColor: "#ffffff",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  detailTilePressable: {
    justifyContent: "space-between",
  },
  detailLabel: { fontSize: 12, color: "#64748b", fontWeight: "700", textTransform: "uppercase" },
  detailValue: { marginTop: 6, fontSize: 15, color: "#0f172a", fontWeight: "800" },
  detailHint: { marginTop: 8, fontSize: 12, lineHeight: 16, color: "#0891b2", fontWeight: "700" },
  ratingBadgeRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ratingBadgeStar: {
    color: "#fbbf24",
    fontSize: 16,
    fontWeight: "800",
  },
  photoSection: { marginTop: 18 },
  photoHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 16, color: "#0f172a", fontWeight: "800" },
  sectionAction: { fontSize: 14, color: "#0891b2", fontWeight: "800" },
  photoRow: { marginTop: 12, flexDirection: "row", gap: 10 },
  photoCard: {
    flex: 1,
    minHeight: 96,
    backgroundColor: "#dbeafe",
    borderRadius: 20,
    padding: 14,
    justifyContent: "flex-end",
  },
  photoCardWide: { flex: 1.3, backgroundColor: "#cffafe" },
  photoColumn: { flex: 0.9, gap: 10 },
  photoCardTitle: { fontSize: 14, color: "#0f172a", fontWeight: "800" },
  photoCardBody: { marginTop: 4, fontSize: 12, lineHeight: 16, color: "#334155", fontWeight: "500" },
  historySection: { marginTop: 18 },
  hoursSection: { marginTop: 18 },
  hoursCard: {
    marginTop: 12,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  hoursRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f7",
  },
  hoursDayLabel: {
    fontSize: 14,
    color: "#0f172a",
    fontWeight: "700",
  },
  hoursValue: {
    fontSize: 14,
    color: "#0f172a",
    fontWeight: "800",
  },
  hoursValueClosed: {
    color: "#b45309",
  },
  hoursValueUnknown: {
    color: "#64748b",
    fontWeight: "700",
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    padding: 12,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  historyStatus: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 10,
  },
  historyStatusText: { fontSize: 11, fontWeight: "900" },
  historyCopy: { flex: 1 },
  historyTitle: { fontSize: 14, color: "#0f172a", fontWeight: "800" },
  historySubtitle: { marginTop: 3, fontSize: 12, color: "#64748b", fontWeight: "500" },
  infoSection: {
    marginTop: 18,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  infoBody: { marginTop: 8, fontSize: 13, lineHeight: 18, color: "#334155", fontWeight: "500" },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusPillText: { fontSize: 12, fontWeight: "800" },
  sheetActions: { marginTop: 12, flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionDisabled: { opacity: 0.72 },
  actionGhost: { backgroundColor: "#e2e8f0" },
  actionGhostText: { color: "#0f172a", fontWeight: "700" },
  actionSuccess: { backgroundColor: "#dcfce7" },
  actionSuccessText: { color: "#166534", fontWeight: "800" },
  actionPrimary: { backgroundColor: "#0ea5e9" },
  actionPrimaryText: { color: "white", fontWeight: "800" },
  sheetHint: { paddingVertical: 12 },
  sheetHintText: { fontSize: 13, color: "#334155", fontWeight: "500" },
  reviewsModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.24)",
    justifyContent: "flex-end",
  },
  reviewsModalDismissArea: {
    flex: 1,
  },
  reviewsModalCard: {
    maxHeight: "78%",
    backgroundColor: "#f8fafc",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 24,
  },
  reviewsModalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  reviewsModalHeaderCopy: {
    flex: 1,
  },
  reviewsSummaryRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  reviewsSummaryText: {
    fontSize: 14,
    color: "#0f172a",
    fontWeight: "800",
  },
  reviewsLoadingState: {
    paddingVertical: 28,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  reviewsLoadingText: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: "600",
  },
  reviewsScroll: {
    marginTop: 18,
  },
  reviewsScrollContent: {
    paddingBottom: 12,
  },
  reviewCard: {
    marginBottom: 12,
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  reviewCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  reviewAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#0ea5e9",
    alignItems: "center",
    justifyContent: "center",
  },
  reviewAvatarText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  reviewCardCopy: {
    flex: 1,
  },
  reviewAuthor: {
    fontSize: 15,
    color: "#0f172a",
    fontWeight: "800",
  },
  reviewTimestamp: {
    marginTop: 4,
    fontSize: 12,
    color: "#64748b",
    fontWeight: "600",
  },
  reviewBody: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 19,
    color: "#334155",
    fontWeight: "500",
  },
  reviewsEmptyState: {
    marginTop: 18,
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  reviewsEmptyTitle: {
    fontSize: 16,
    color: "#0f172a",
    fontWeight: "800",
  },
  reviewsEmptyBody: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: "#64748b",
    fontWeight: "500",
  },
  sheetHeroDraft: {
    marginTop: 14,
    backgroundColor: "#ecfeff",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#a5f3fc",
  },
  sheetHeroDraftLabel: { fontSize: 16, color: "#0f172a", fontWeight: "800" },
  sheetHeroDraftMeta: { marginTop: 6, fontSize: 13, lineHeight: 18, color: "#155e75", fontWeight: "500" },
  formGroup: { marginTop: 14 },
  formHelperText: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: "#64748b",
    fontWeight: "500",
  },
  formRow: { marginTop: 14, flexDirection: "row", gap: 10 },
  formColumn: { flex: 1 },
  inputLabel: { marginBottom: 6, fontSize: 12, color: "#475569", fontWeight: "800", textTransform: "uppercase" },
  scheduleCard: {
    marginTop: 12,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "#dbe4ee",
  },
  scheduleRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f7",
  },
  scheduleRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  scheduleDayLabel: {
    fontSize: 14,
    color: "#0f172a",
    fontWeight: "800",
  },
  scheduleClosedChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#e2e8f0",
  },
  scheduleClosedChipActive: {
    backgroundColor: "#fee2e2",
  },
  scheduleClosedChipText: {
    fontSize: 12,
    color: "#0f172a",
    fontWeight: "800",
  },
  scheduleClosedChipTextActive: {
    color: "#b91c1c",
  },
  scheduleClosedHint: {
    marginTop: 10,
    fontSize: 13,
    color: "#b45309",
    fontWeight: "700",
  },
  textField: {
    minHeight: 48,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#dbe4ee",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#0f172a",
    fontWeight: "600",
  },
  textFieldMultiline: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  coordinateHint: {
    marginTop: 14,
    fontSize: 12,
    lineHeight: 18,
    color: "#475569",
    fontWeight: "600",
  },
  validationPanel: {
    marginTop: 14,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  validationTitle: { fontSize: 15, color: "#0f172a", fontWeight: "800" },
  validationBody: { marginTop: 6, fontSize: 13, lineHeight: 18, color: "#475569", fontWeight: "500" },
  reportOptions: { marginTop: 14, gap: 10 },
  reportOption: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  reportOptionText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  reportCancel: { marginTop: 12 },
  peekFooter: { marginTop: 14, backgroundColor: "#ffffff", borderRadius: 18, padding: 12, borderWidth: 1, borderColor: "#e2e8f0" },
  peekFooterText: { fontSize: 13, lineHeight: 18, color: "#475569", fontWeight: "500" },
  searchModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.24)",
    justifyContent: "flex-start",
  },
  searchModalDismissArea: { flex: 1 },
  searchModalCard: {
    position: "absolute",
    top: 54,
    left: 12,
    right: 12,
    maxHeight: "70%",
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 14,
    shadowColor: "#0f172a",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  searchModalTopRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  searchScroll: { marginTop: 12 },
  searchScrollContent: { paddingBottom: 14 },
  searchInputWrap: {
    flex: 1,
    minHeight: 52,
    backgroundColor: "#f8fafc",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  searchInputIcon: { fontSize: 18, color: "#0f172a" },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    color: "#0f172a",
    fontWeight: "600",
  },
  searchCloseBtn: {
    backgroundColor: "#e2e8f0",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  searchCloseBtnText: { fontSize: 13, color: "#0f172a", fontWeight: "800" },
  searchChipsRow: { flexDirection: "row", gap: 8 },
  searchChip: {
    backgroundColor: "#ecfeff",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#bae6fd",
  },
  searchChipText: { fontSize: 12, color: "#155e75", fontWeight: "800" },
  recentSection: { marginTop: 16 },
  resultsSection: { marginTop: 16 },
  searchSectionTitle: { fontSize: 13, color: "#64748b", fontWeight: "800", textTransform: "uppercase" },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  recentRowIcon: { fontSize: 14, color: "#64748b", marginRight: 10 },
  recentRowText: { fontSize: 15, color: "#0f172a", fontWeight: "600" },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  resultDot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  resultCopy: { flex: 1 },
  resultTitle: { fontSize: 15, color: "#0f172a", fontWeight: "800" },
  resultSubtitle: { marginTop: 3, fontSize: 12, color: "#64748b", fontWeight: "500" },
  resultAction: { fontSize: 13, color: "#0891b2", fontWeight: "800" },
  emptySearchState: {
    paddingVertical: 20,
    alignItems: "center",
  },
  emptySearchTitle: { fontSize: 16, color: "#0f172a", fontWeight: "800" },
  emptySearchBody: { marginTop: 6, fontSize: 13, lineHeight: 18, color: "#64748b", textAlign: "center" },
  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.24)",
    flexDirection: "row",
  },
  menuDismissArea: { flex: 0.18 },
  menuPanel: {
    flex: 0.82,
    backgroundColor: "#ffffff",
    paddingTop: 56,
    paddingHorizontal: 14,
    paddingBottom: 18,
    shadowColor: "#0f172a",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 8, height: 0 },
    elevation: 12,
  },
  menuProfileCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 24,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  menuAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#0ea5e9",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  menuAvatarImage: {
    width: "100%",
    height: "100%",
  },
  menuAvatarText: { color: "#ffffff", fontSize: 18, fontWeight: "900" },
  menuProfileCopy: { marginTop: 12 },
  menuProfileTitle: { fontSize: 20, color: "#0f172a", fontWeight: "900" },
  menuProfileSubtitle: { marginTop: 6, fontSize: 13, lineHeight: 18, color: "#475569", fontWeight: "500" },
  menuPrimaryBtn: {
    marginTop: 14,
    backgroundColor: "#0f172a",
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: "center",
  },
  menuPrimaryBtnText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
  menuScroll: { marginTop: 14 },
  menuScrollContent: { paddingBottom: 24 },
  menuSection: { marginTop: 12 },
  menuSectionTitle: { fontSize: 13, color: "#64748b", fontWeight: "800", textTransform: "uppercase" },
  menuActionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    padding: 14,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  menuActionIcon: { width: 28, fontSize: 18, color: "#0891b2", textAlign: "center" },
  menuActionCopy: { flex: 1, marginLeft: 10 },
  menuActionTitle: { fontSize: 15, color: "#0f172a", fontWeight: "800" },
  menuActionSubtitle: { marginTop: 4, fontSize: 12, lineHeight: 17, color: "#64748b", fontWeight: "500" },
  menuEmptyText: { marginTop: 10, fontSize: 13, lineHeight: 18, color: "#64748b" },
  menuReportRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    padding: 12,
    backgroundColor: "#f8fafc",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  menuReportStatus: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 10,
  },
  menuReportStatusText: { fontSize: 11, fontWeight: "900" },
  menuReportCopy: { flex: 1 },
  menuReportTitle: { fontSize: 14, color: "#0f172a", fontWeight: "800" },
  menuReportSubtitle: { marginTop: 3, fontSize: 12, color: "#64748b", fontWeight: "500" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  subtitle: { fontSize: 14, opacity: 0.7, textAlign: "center" },
});
