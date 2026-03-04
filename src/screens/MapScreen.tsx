import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Region } from "react-native-maps";
import * as Location from "expo-location";
import { SafeAreaView } from "react-native-safe-area-context";
import { fetchPlaces, type ParkingPlace, type ParkingStatus } from "../lib/places";

type PermissionState = "unknown" | "granted" | "denied";
type LatLng = { latitude: number; longitude: number };

export default function MapScreen() {
  const mapRef = useRef<MapView>(null);

  const [permission, setPermission] = useState<PermissionState>("unknown");
  const [region, setRegion] = useState<Region | null>(null);
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(true);
  const [places, setPlaces] = useState<ParkingPlace[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [isAddMode, setIsAddMode] = useState(false);
  const [draftPlaceCoord, setDraftPlaceCoord] = useState<LatLng | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setIsLoadingPlaces(true);
      const nextPlaces = await fetchPlaces();
      if (active) {
        setPlaces(nextPlaces);
        setSelectedPlaceId(nextPlaces[0]?.id ?? null);
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
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setPermission("denied");
        return;
      }
      setPermission("granted");

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const nextRegion: Region = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };

      setRegion(nextRegion);

      requestAnimationFrame(() => {
        mapRef.current?.animateToRegion(nextRegion, 600);
      });
    })().catch((e) => {
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

  const onCenterPress = async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const nextRegion: Region = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
      setRegion(nextRegion);
      mapRef.current?.animateToRegion(nextRegion, 500);
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "No se pudo centrar el mapa.");
    }
  };

  const onStartAddPlace = () => {
    setIsAddMode(true);
    setDraftPlaceCoord(null);
    setSelectedPlaceId(null);
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

  const getUpdatedLabel = (place: ParkingPlace) => {
    if (!place.updatedAt) return "Sin actualizacion reciente";
    const diffMs = Date.now() - new Date(place.updatedAt).getTime();
    if (!Number.isFinite(diffMs) || diffMs < 0) return "Actualizado recientemente";

    const mins = Math.max(1, Math.floor(diffMs / (1000 * 60)));
    if (mins < 60) return `Actualizado hace ${mins} min`;

    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Actualizado hace ${hours} h`;

    const days = Math.floor(hours / 24);
    return `Actualizado hace ${days} d`;
  };

  const statusToLabel = (status: ParkingStatus) => {
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
  };

  const statusToColor = (status: ParkingStatus) => {
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
  };

  if (permission === "denied") {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Permiso de ubicacion requerido</Text>
        <Text style={styles.subtitle}>Activa ubicacion para ver estacionamientos cerca de ti.</Text>
      </View>
    );
  }

  const initialRegion: Region = region ?? {
    latitude: 21.88234,
    longitude: -102.28259,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        onPress={(e) => {
          if (isAddMode) {
            setDraftPlaceCoord(e.nativeEvent.coordinate);
            return;
          }
          setSelectedPlaceId(null);
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
            onPress={() => setSelectedPlaceId(place.id)}
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

      <View style={styles.topOverlay}>
        <Text style={styles.topTitle}>ParkPulse</Text>
        <Text style={styles.topSubtitle}>Aguascalientes piloto</Text>
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
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Agregar estacionamiento</Text>
          <Text style={styles.sheetSubtitle}>Toca el mapa para fijar ubicacion o usa el centro actual.</Text>
          <View style={styles.sheetActions}>
            <Pressable style={[styles.actionBtn, styles.actionGhost]} onPress={onCancelAddPlace}>
              <Text style={styles.actionGhostText}>Cancelar</Text>
            </Pressable>
            <Pressable style={[styles.actionBtn, styles.actionPrimary]} onPress={onSaveNewPlace}>
              <Text style={styles.actionPrimaryText}>Guardar lugar</Text>
            </Pressable>
          </View>
        </View>
      ) : selectedPlace ? (
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle} numberOfLines={1}>
              {selectedPlace.name}
            </Text>
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

          <Text style={styles.sheetSubtitle}>{getUpdatedLabel(selectedPlace)}</Text>
          <Text style={styles.sheetMeta}>
            {selectedPlace.source === "remote" ? "Dato comunitario" : "Dato local de prueba"}
            {isLoadingPlaces ? " . Cargando..." : ""}
          </Text>

          <View style={styles.sheetActions}>
            <Pressable
              style={[styles.actionBtn, styles.actionGhost]}
              onPress={() => Alert.alert("Proximo paso", "Aqui abriremos el flujo de reporte.")}
            >
              <Text style={styles.actionGhostText}>Reportar</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.actionPrimary]}
              onPress={() => onNavigatePress(selectedPlace)}
            >
              <Text style={styles.actionPrimaryText}>Navegar</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={[styles.sheet, styles.sheetHint]}>
          <Text style={styles.sheetHintText}>
            Toca un marcador para ver detalles o usa + para agregar uno nuevo.
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  topOverlay: {
    position: "absolute",
    left: 12,
    right: 12,
    top: 12,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  topTitle: { fontSize: 18, fontWeight: "800", color: "#0f172a" },
  topSubtitle: { marginTop: 2, fontSize: 13, color: "#64748b", fontWeight: "500" },
  legendRow: { marginTop: 10, flexDirection: "row", gap: 14 },
  legendItem: { flexDirection: "row", alignItems: "center" },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  legendText: { fontSize: 12, color: "#0f172a", fontWeight: "600" },
  fabColumn: {
    position: "absolute",
    right: 16,
    bottom: 220,
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
    backgroundColor: "#ffffff",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: "#0f172a",
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 9,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: { fontSize: 17, fontWeight: "800", color: "#0f172a", maxWidth: "70%" },
  sheetSubtitle: { marginTop: 4, fontSize: 13, color: "#475569", fontWeight: "500" },
  sheetMeta: { marginTop: 2, fontSize: 12, color: "#94a3b8" },
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  subtitle: { fontSize: 14, opacity: 0.7, textAlign: "center" },
});
