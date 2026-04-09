import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { AuthenticatedAppUser } from "../lib/auth";
import { fetchPlaces, type ParkingPlace } from "../lib/places";
import {
  formatCapacitySummary,
  formatCostSummary,
  formatRatingSummary,
  formatReportVolumeSummary,
} from "../lib/parkingPresentation";
import {
  fetchSavedPlaceIds,
  mapSavedPlaces,
  removeSavedPlaceForUser,
} from "../lib/savedPlaces";
import { useAppTheme } from "../theme/AppThemeContext";

export type SavedPlacesScreenProps = {
  currentUser: AuthenticatedAppUser;
  onOpenPlace?: (placeId: string) => void;
};

function statusToLabel(status: ParkingPlace["status"]) {
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

function statusToColor(status: ParkingPlace["status"]) {
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

function getElapsedLabel(isoDate: string | null) {
  if (!isoDate) return "Hace un momento";

  const diffMs = Date.now() - new Date(isoDate).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "Hace un momento";

  const mins = Math.max(1, Math.floor(diffMs / (1000 * 60)));
  if (mins < 60) return `Hace ${mins} min`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours} h`;

  const days = Math.floor(hours / 24);
  return `Hace ${days} d`;
}

export default function SavedPlacesScreen({
  currentUser,
  onOpenPlace,
}: SavedPlacesScreenProps) {
  const theme = useAppTheme();
  const [places, setPlaces] = useState<ParkingPlace[]>([]);
  const [savedPlaceIds, setSavedPlaceIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [removingPlaceId, setRemovingPlaceId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadSavedPlaces = async () => {
      setIsLoading(true);

      try {
        const [nextSavedPlaceIds, nextPlaces] = await Promise.all([
          fetchSavedPlaceIds(currentUser.id),
          fetchPlaces(),
        ]);

        if (!active) return;

        setSavedPlaceIds(nextSavedPlaceIds);
        setPlaces(nextPlaces);
      } catch (error) {
        console.error(error);
        if (!active) return;

        setSavedPlaceIds([]);
        setPlaces([]);
        Alert.alert("Error", "No se pudieron cargar tus lugares guardados.");
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    loadSavedPlaces().catch((error) => {
      console.error(error);
      if (!active) return;

      setSavedPlaceIds([]);
      setPlaces([]);
      setIsLoading(false);
      Alert.alert("Error", "No se pudieron cargar tus lugares guardados.");
    });

    return () => {
      active = false;
    };
  }, [currentUser.id]);

  const handleRefresh = async () => {
    setIsRefreshing(true);

    try {
      const [nextSavedPlaceIds, nextPlaces] = await Promise.all([
        fetchSavedPlaceIds(currentUser.id),
        fetchPlaces(),
      ]);

      setSavedPlaceIds(nextSavedPlaceIds);
      setPlaces(nextPlaces);
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "No se pudieron actualizar tus lugares guardados.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleOpenPlace = (place: ParkingPlace) => {
    if (onOpenPlace) {
      onOpenPlace(place.id);
      return;
    }

    Alert.alert("Mapa", "Este lugar se abrirá desde el mapa principal.");
  };

  const handleRemovePlace = async (place: ParkingPlace) => {
    try {
      setRemovingPlaceId(place.id);
      const nextSavedPlaceIds = await removeSavedPlaceForUser(currentUser.id, place.id);
      setSavedPlaceIds(nextSavedPlaceIds);
      Alert.alert("Guardado actualizado", `${place.name} ya no aparece en tus guardados.`);
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "No se pudo quitar el lugar de tus guardados.");
    } finally {
      setRemovingPlaceId(null);
    }
  };

  const savedPlaces = useMemo(() => {
    return mapSavedPlaces(places, savedPlaceIds);
  }, [places, savedPlaceIds]);

  const summary = useMemo(() => {
    return {
      total: savedPlaces.length,
      available: savedPlaces.filter((place) => place.status === "available").length,
      full: savedPlaces.filter((place) => place.status === "full").length,
      closed: savedPlaces.filter((place) => place.status === "closed").length,
      latestUpdateAt: savedPlaces
        .map((place) => place.updatedAt)
        .find((updatedAt) => updatedAt !== null) ?? null,
    };
  }, [savedPlaces]);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.surface }]}
      edges={["bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.heroCard, { backgroundColor: theme.primary }]}>
          <Text style={[styles.eyebrow, { color: theme.accentSoft }]}>Tus favoritos</Text>
          <Text style={styles.title}>Lugares guardados</Text>
          <Text style={styles.body}>
            Consulta rápidamente los estacionamientos que guardaste para volver a
            ellos desde el mapa principal.
          </Text>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{summary.total}</Text>
              <Text style={styles.summaryLabel}>Guardados</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{summary.available}</Text>
              <Text style={styles.summaryLabel}>Disponibles</Text>
            </View>
          </View>

          <View style={styles.statusRow}>
            <View style={styles.statusChip}>
              <Text style={styles.statusChipLabel}>Llenos</Text>
              <Text style={styles.statusChipValue}>{summary.full}</Text>
            </View>
            <View style={styles.statusChip}>
              <Text style={styles.statusChipLabel}>Cerrados</Text>
              <Text style={styles.statusChipValue}>{summary.closed}</Text>
            </View>
          </View>

          <View style={styles.heroFooter}>
            <Text style={styles.heroFooterText}>
              {summary.latestUpdateAt
                ? `Última actualización ${getElapsedLabel(summary.latestUpdateAt)}`
                : "Tus guardados se sincronizan con los datos del mapa."}
            </Text>
            <Pressable
              testID="saved-places-refresh-button"
              style={[styles.refreshButton, { backgroundColor: theme.accentSoft }]}
              onPress={handleRefresh}
              disabled={isRefreshing}
            >
              <Text style={[styles.refreshButtonText, { color: theme.text }]}>
                {isRefreshing ? "Actualizando..." : "Actualizar"}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.listSection}>
          <Text style={[styles.listTitle, { color: theme.text }]}>Tu lista</Text>

          {isLoading ? (
            <View
              style={[
                styles.emptyCard,
                { backgroundColor: theme.surfaceAlt, borderColor: theme.accentSoft },
              ]}
            >
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Cargando guardados...</Text>
              <Text style={[styles.emptyBody, { color: theme.textMuted }]}>
                Estamos recuperando los lugares que marcaste para volver rápidamente
                a ellos.
              </Text>
            </View>
          ) : savedPlaces.length === 0 ? (
            <View
              style={[
                styles.emptyCard,
                { backgroundColor: theme.surfaceAlt, borderColor: theme.accentSoft },
              ]}
            >
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                Todavía no tienes lugares guardados.
              </Text>
              <Text style={[styles.emptyBody, { color: theme.textMuted }]}>
                Cuando toques &quot;Guardar&quot; desde la ficha de un estacionamiento,
                lo verás aquí con su estado más reciente.
              </Text>
            </View>
          ) : (
            savedPlaces.map((place) => (
              <View
                key={place.id}
                style={[
                  styles.placeCard,
                  { backgroundColor: theme.surfaceAlt, borderColor: theme.accentSoft },
                ]}
              >
                <View style={styles.placeTopRow}>
                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: `${statusToColor(place.status)}22` },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        { color: statusToColor(place.status) },
                      ]}
                    >
                      {statusToLabel(place.status)}
                    </Text>
                  </View>
                  <Text style={[styles.placeElapsed, { color: theme.textMuted }]}>
                    {getElapsedLabel(place.updatedAt)}
                  </Text>
                </View>

                <Text style={[styles.placeName, { color: theme.text }]}>{place.name}</Text>
                <Text style={[styles.placeAddress, { color: theme.textMuted }]}>
                  {place.address ?? "Dirección por validar"}
                </Text>

                <View style={styles.metaGrid}>
                  <View
                    style={[
                      styles.metaCard,
                      { backgroundColor: theme.surface, borderColor: theme.accentSoft },
                    ]}
                  >
                    <Text style={[styles.metaLabel, { color: theme.textMuted }]}>Costo</Text>
                    <Text style={[styles.metaValue, { color: theme.text }]}>
                      {formatCostSummary(place)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.metaCard,
                      { backgroundColor: theme.surface, borderColor: theme.accentSoft },
                    ]}
                  >
                    <Text style={[styles.metaLabel, { color: theme.textMuted }]}>Capacidad</Text>
                    <Text style={[styles.metaValue, { color: theme.text }]}>
                      {formatCapacitySummary(place)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.metaCard,
                      { backgroundColor: theme.surface, borderColor: theme.accentSoft },
                    ]}
                  >
                    <Text style={[styles.metaLabel, { color: theme.textMuted }]}>Calificacion</Text>
                    <Text style={[styles.metaValue, { color: theme.text }]}>
                      {formatRatingSummary(place)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.metaCard,
                      { backgroundColor: theme.surface, borderColor: theme.accentSoft },
                    ]}
                  >
                    <Text style={[styles.metaLabel, { color: theme.textMuted }]}>Actividad</Text>
                    <Text style={[styles.metaValue, { color: theme.text }]}>
                      {formatReportVolumeSummary(place)}
                    </Text>
                  </View>
                </View>

                <View style={styles.actionRow}>
                  <Pressable
                    testID={`saved-place-open-${place.id}`}
                    style={[
                      styles.actionButton,
                      styles.primaryButton,
                      { backgroundColor: theme.accent },
                    ]}
                    onPress={() => handleOpenPlace(place)}
                  >
                    <Text style={styles.primaryButtonText}>Ver en mapa</Text>
                  </Pressable>
                  <Pressable
                    testID={`saved-place-remove-${place.id}`}
                    style={[
                      styles.actionButton,
                      styles.secondaryButton,
                      { backgroundColor: theme.primarySoft },
                    ]}
                    onPress={() => handleRemovePlace(place)}
                    disabled={removingPlaceId === place.id}
                  >
                    <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
                      {removingPlaceId === place.id ? "Quitando..." : "Quitar"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    padding: 16,
    paddingBottom: 28,
  },
  heroCard: {
    backgroundColor: "#0f172a",
    borderRadius: 28,
    padding: 18,
    shadowColor: "#0f172a",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "800",
    color: "#67e8f9",
    textTransform: "uppercase",
  },
  title: {
    marginTop: 8,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "900",
    color: "#f8fafc",
  },
  body: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: "#cbd5e1",
    fontWeight: "500",
  },
  summaryGrid: {
    marginTop: 18,
    flexDirection: "row",
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 20,
    padding: 14,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: "900",
    color: "#ffffff",
  },
  summaryLabel: {
    marginTop: 4,
    fontSize: 12,
    color: "#cbd5e1",
    fontWeight: "700",
    textTransform: "uppercase",
  },
  statusRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
  },
  statusChip: {
    flex: 1,
    backgroundColor: "rgba(148,163,184,0.14)",
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  statusChipLabel: {
    fontSize: 11,
    color: "#cbd5e1",
    fontWeight: "700",
    textTransform: "uppercase",
  },
  statusChipValue: {
    marginTop: 6,
    fontSize: 20,
    color: "#ffffff",
    fontWeight: "900",
  },
  heroFooter: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  heroFooterText: {
    flex: 1,
    fontSize: 13,
    color: "#cbd5e1",
    fontWeight: "600",
  },
  refreshButton: {
    backgroundColor: "#22c55e",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  refreshButtonText: {
    color: "#052e16",
    fontSize: 12,
    fontWeight: "900",
  },
  listSection: {
    marginTop: 18,
  },
  listTitle: {
    fontSize: 16,
    color: "#0f172a",
    fontWeight: "800",
  },
  emptyCard: {
    marginTop: 12,
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  emptyTitle: {
    fontSize: 18,
    color: "#0f172a",
    fontWeight: "800",
  },
  emptyBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: "#475569",
    fontWeight: "500",
  },
  placeCard: {
    marginTop: 12,
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  placeTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "900",
  },
  placeElapsed: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "700",
  },
  placeName: {
    marginTop: 12,
    fontSize: 18,
    color: "#0f172a",
    fontWeight: "900",
  },
  placeAddress: {
    marginTop: 4,
    fontSize: 13,
    color: "#64748b",
    fontWeight: "600",
  },
  metaGrid: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metaCard: {
    width: "48%",
    backgroundColor: "#f8fafc",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  metaLabel: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "700",
    textTransform: "uppercase",
  },
  metaValue: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: "#0f172a",
    fontWeight: "700",
  },
  actionRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    backgroundColor: "#0ea5e9",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryButton: {
    backgroundColor: "#e2e8f0",
  },
  secondaryButtonText: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "800",
  },
});
