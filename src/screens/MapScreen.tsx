import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import MapView, { Marker, Region } from "react-native-maps";
import * as Location from "expo-location";
import { SafeAreaView } from "react-native-safe-area-context";
import { fetchPlaces, type ParkingPlace, type ParkingStatus } from "../lib/places";

type PermissionState = "unknown" | "granted" | "denied";
type LatLng = { latitude: number; longitude: number };
type ReportStatus = Exclude<ParkingStatus, "unknown">;

const PILOT_REGION: Region = {
  latitude: 21.88234,
  longitude: -102.28259,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const REPORT_RADIUS_METERS = 200;

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
  if (!place.updatedAt) return "Sin actualizacion reciente";
  const diffMs = Date.now() - new Date(place.updatedAt).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "Actualizado recientemente";

  const mins = Math.max(1, Math.floor(diffMs / (1000 * 60)));
  if (mins < 60) return `Actualizado hace ${mins} min`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Actualizado hace ${hours} h`;

  const days = Math.floor(hours / 24);
  return `Actualizado hace ${days} d`;
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

export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const placeSheetRef = useRef<BottomSheet>(null);
  const ignoreNextMapPressRef = useRef(false);

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
  const placeSheetSnapPoints = useMemo(() => ["32%", "76%"], []);
  const isPlaceSheetExpanded = placeSheetIndex === 1;

  useEffect(() => {
    let active = true;

    const load = async () => {
      setIsLoadingPlaces(true);
      const nextPlaces = await fetchPlaces();
      if (active) {
        setPlaces(nextPlaces);
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
        latitude: lat + 0.002,
        longitude: lng + 0.002,
        status: "unknown" as ParkingStatus,
        updatedAt: null,
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

  const onStartAddPlace = () => {
    setIsAddMode(true);
    setDraftPlaceCoord(null);
    setSelectedPlaceId(null);
    setReportingPlaceId(null);
  };

  const onCancelAddPlace = () => {
    setIsAddMode(false);
    setDraftPlaceCoord(null);
  };

  const onSaveNewPlace = () => {
    const coord =
      draftPlaceCoord ?? (region ? { latitude: region.latitude, longitude: region.longitude } : null);

    if (!coord) {
      Alert.alert("Ubicacion no disponible", "Mueve el mapa o toca una zona para agregar el lugar.");
      return;
    }

    const newPlace: ParkingPlace = {
      id: `local-${Date.now()}`,
      name: "Nuevo estacionamiento",
      latitude: coord.latitude,
      longitude: coord.longitude,
      status: "unknown",
      updatedAt: new Date().toISOString(),
      source: "fallback",
    };

    setPlaces((prev) => [newPlace, ...prev]);
    setSelectedPlaceId(newPlace.id);
    setIsAddMode(false);
    setDraftPlaceCoord(null);
    setPlaceSheetIndex(1);
    requestAnimationFrame(() => {
      placeSheetRef.current?.snapToIndex(1);
    });
  };

  const onStartReport = (place: ParkingPlace) => {
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

      const updatedAt = new Date().toISOString();

      setPlaces((prev) =>
        prev.map((place) =>
          place.id === reportingPlace.id
            ? {
                ...place,
                status,
                updatedAt,
              }
            : place
        )
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
        <Pressable style={styles.menuButton} onPress={() => Alert.alert("Proximo paso", "Aqui abriremos menu, perfil y acceso.")}>
          <Text style={styles.menuButtonIcon}>≡</Text>
        </Pressable>

        <Pressable style={styles.searchBar} onPress={() => Alert.alert("Busqueda", "La barra de busqueda sera el siguiente flujo UI.")}>
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
          style={[styles.fab, styles.fabPrimary, isAddMode && styles.fabPrimaryActive]}
          onPress={isAddMode ? onCancelAddPlace : onStartAddPlace}
        >
          <Text style={styles.fabPrimaryIcon}>{isAddMode ? "x" : "+"}</Text>
        </Pressable>

        <Pressable style={[styles.fab, styles.fabSecondary]} onPress={onCenterPress}>
          <Text style={styles.fabSecondaryIcon}>◎</Text>
        </Pressable>
      </View>

      {isAddMode ? (
        <View style={[styles.sheet, styles.sheetExpanded]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Agregar estacionamiento</Text>
          <Text style={styles.sheetSubtitle}>Toca el mapa para fijar ubicacion o usa el centro actual.</Text>
          <View style={styles.sheetHeroDraft}>
            <Text style={styles.sheetHeroDraftLabel}>Nuevo punto comunitario</Text>
            <Text style={styles.sheetHeroDraftMeta}>Despues podremos pedir foto, nombre y tipo de acceso.</Text>
          </View>
          <View style={styles.sheetActions}>
            <Pressable style={[styles.actionBtn, styles.actionGhost]} onPress={onCancelAddPlace}>
              <Text style={styles.actionGhostText}>Cancelar</Text>
            </Pressable>
            <Pressable style={[styles.actionBtn, styles.actionPrimary]} onPress={onSaveNewPlace}>
              <Text style={styles.actionPrimaryText}>Guardar lugar</Text>
            </Pressable>
          </View>
        </View>
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
              style={[styles.reportOption, { backgroundColor: "#16a34a" }]}
              onPress={() => submitReport("available")}
            >
              <Text style={styles.reportOptionText}>Disponible</Text>
            </Pressable>
            <Pressable
              style={[styles.reportOption, { backgroundColor: "#ef4444" }]}
              onPress={() => submitReport("full")}
            >
              <Text style={styles.reportOptionText}>Lleno</Text>
            </Pressable>
            <Pressable
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
                style={[styles.primaryActionCard, styles.primaryActionSoft]}
                onPress={() => onStartReport(selectedPlace)}
              >
                <Text style={[styles.primaryActionEmoji, styles.primaryActionEmojiSoft]}>✓</Text>
                <Text style={styles.primaryActionTitle}>Validar</Text>
                <Text style={styles.primaryActionBody}>Confirmar si hay espacio</Text>
              </Pressable>
            </View>

            <View style={styles.detailsGrid}>
              <View style={styles.detailTile}>
                <Text style={styles.detailLabel}>Confianza</Text>
                <Text style={styles.detailValue}>
                  {selectedPlace.status === "unknown" ? "Baja" : selectedPlace.source === "remote" ? "Media" : "Pendiente"}
                </Text>
              </View>
              <View style={styles.detailTile}>
                <Text style={styles.detailLabel}>Acceso</Text>
                <Text style={styles.detailValue}>Publico</Text>
              </View>
              <View style={styles.detailTile}>
                <Text style={styles.detailLabel}>Horario</Text>
                <Text style={styles.detailValue}>Por validar</Text>
              </View>
              <View style={styles.detailTile}>
                <Text style={styles.detailLabel}>Costo</Text>
                <Text style={styles.detailValue}>Sin datos</Text>
              </View>
            </View>

            <View style={styles.photoSection}>
              <View style={styles.photoHeaderRow}>
                <Text style={styles.sectionTitle}>Fotos del lugar</Text>
                <Pressable onPress={() => Alert.alert("Proximo paso", "Aqui agregaremos fotos del estacionamiento.")}>
                  <Text style={styles.sectionAction}>Agregar</Text>
                </Pressable>
              </View>
              <View style={styles.photoRow}>
                <View style={[styles.photoCard, styles.photoCardWide]}>
                  <Text style={styles.photoCardTitle}>Fachada / entrada</Text>
                  <Text style={styles.photoCardBody}>Sirve para reconocer rapido el acceso al estacionamiento.</Text>
                </View>
                <View style={styles.photoColumn}>
                  <View style={styles.photoCard}>
                    <Text style={styles.photoCardTitle}>Tarifa</Text>
                  </View>
                  <View style={styles.photoCard}>
                    <Text style={styles.photoCardTitle}>Senaletica</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.infoSection}>
              <Text style={styles.sectionTitle}>Sobre este lugar</Text>
              <Text style={styles.infoBody}>
                Esta ficha esta pensada como una mezcla entre Google Maps y Waze: informacion util,
                validaciones rapidas y espacio para que la comunidad mantenga el lugar actualizado.
              </Text>
            </View>

            <View style={styles.sheetActions}>
              <Pressable
                style={[styles.actionBtn, styles.actionGhost]}
                onPress={() => Alert.alert("Proximo paso", "Aqui abriremos guardados, compartir o historial del lugar.")}
              >
                <Text style={styles.actionGhostText}>Guardar</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, styles.actionPrimary]}
                onPress={() => onStartReport(selectedPlace)}
              >
                <Text style={styles.actionPrimaryText}>Actualizar estado</Text>
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
  fabPrimaryIcon: {
    color: "white",
    fontSize: 30,
    lineHeight: 30,
    marginTop: -2,
    fontWeight: "700",
  },
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
  detailLabel: { fontSize: 12, color: "#64748b", fontWeight: "700", textTransform: "uppercase" },
  detailValue: { marginTop: 6, fontSize: 15, color: "#0f172a", fontWeight: "800" },
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
  actionGhost: { backgroundColor: "#e2e8f0" },
  actionGhostText: { color: "#0f172a", fontWeight: "700" },
  actionPrimary: { backgroundColor: "#0ea5e9" },
  actionPrimaryText: { color: "white", fontWeight: "800" },
  sheetHint: { paddingVertical: 12 },
  sheetHintText: { fontSize: 13, color: "#334155", fontWeight: "500" },
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  subtitle: { fontSize: 14, opacity: 0.7, textAlign: "center" },
});
