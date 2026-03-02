import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Region } from "react-native-maps";
import * as Location from "expo-location";
import { fetchPlaces, type ParkingPlace, type ParkingStatus } from "../lib/places";

type PermissionState = "unknown" | "granted" | "denied";

export default function MapScreen() {
  const mapRef = useRef<MapView>(null);

  const [permission, setPermission] = useState<PermissionState>("unknown");
  const [region, setRegion] = useState<Region | null>(null);
  const [places, setPlaces] = useState<ParkingPlace[]>([]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const nextPlaces = await fetchPlaces();
      if (active) setPlaces(nextPlaces);
    };

    load().catch((e) => {
      console.error(e);
      Alert.alert("Error", "No se pudo cargar estacionamientos.");
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

      // Smooth center animation
      requestAnimationFrame(() => {
        mapRef.current?.animateToRegion(nextRegion, 600);
      });
    })().catch((e) => {
      console.error(e);
      Alert.alert("Error", "No se pudo obtener tu ubicación.");
    });
  }, []);

  const mapReadyPlaces = useMemo(() => {
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
        return "#15a34a";
      case "full":
        return "#ef4444";
      case "closed":
        return "#334155";
      default:
        return "#f59e0b";
    }
  };

  if (permission === "denied") {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Permiso de ubicación requerido</Text>
        <Text style={styles.subtitle}>
          Activa ubicación para ver estacionamientos cerca de ti.
        </Text>
      </View>
    );
  }

  // Fallback region until GPS resolves
  const initialRegion: Region = region ?? {
    latitude: 21.88234,
    longitude: -102.28259,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
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
            onPress={() =>
              Alert.alert(
                place.name,
                `Estado: ${statusToLabel(place.status)}\nAquí abrirás el bottom sheet en Sprint 1`
              )
            }
          />
        ))}
      </MapView>

      <Pressable style={styles.centerBtn} onPress={onCenterPress}>
        <Text style={styles.centerBtnText}>Centrar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  centerBtn: {
    position: "absolute",
    right: 16,
    bottom: 24,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "black",
  },
  centerBtnText: { color: "white", fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  subtitle: { fontSize: 14, opacity: 0.7, textAlign: "center" },
});
