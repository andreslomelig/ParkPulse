import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { AuthenticatedAppUser } from "../lib/auth";
import { fetchReportsForUser, type ParkingReport } from "../lib/reports";

export type ReportHistoryScreenProps = {
  currentUser: AuthenticatedAppUser;
};

const REPORT_HISTORY_LIMIT = 25;

function statusToLabel(status: ParkingReport["status"]) {
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

function statusToColor(status: ParkingReport["status"]) {
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

function formatReportDate(isoDate: string) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "Fecha no disponible";
  }

  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
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

export default function ReportHistoryScreen({
  currentUser,
}: ReportHistoryScreenProps) {
  const [reports, setReports] = useState<ParkingReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    let active = true;

    const loadReports = async () => {
      setIsLoading(true);

      try {
        const nextReports = await fetchReportsForUser(currentUser.id, REPORT_HISTORY_LIMIT);
        if (!active) return;

        setReports(nextReports);
      } catch (error) {
        console.error(error);
        if (!active) return;

        setReports([]);
        Alert.alert("Error", "No se pudo cargar tu historial de reportes.");
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    loadReports().catch((error) => {
      console.error(error);
      if (!active) return;

      setReports([]);
      setIsLoading(false);
      Alert.alert("Error", "No se pudo cargar tu historial de reportes.");
    });

    return () => {
      active = false;
    };
  }, [currentUser.id]);

  const handleRefresh = async () => {
    setIsRefreshing(true);

    try {
      const nextReports = await fetchReportsForUser(currentUser.id, REPORT_HISTORY_LIMIT);
      setReports(nextReports);
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "No se pudo actualizar tu historial de reportes.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const summary = useMemo(() => {
    const uniquePlaces = new Set(reports.map((report) => report.placeId));

    return {
      total: reports.length,
      places: uniquePlaces.size,
      available: reports.filter((report) => report.status === "available").length,
      full: reports.filter((report) => report.status === "full").length,
      closed: reports.filter((report) => report.status === "closed").length,
      lastReportAt: reports[0]?.createdAt ?? null,
    };
  }, [reports]);

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Tu actividad</Text>
          <Text style={styles.title}>Historial de reportes</Text>
          <Text style={styles.body}>
            Revisa los estados que has validado y en qué estacionamientos has
            participado recientemente.
          </Text>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{summary.total}</Text>
              <Text style={styles.summaryLabel}>Reportes</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{summary.places}</Text>
              <Text style={styles.summaryLabel}>Lugares</Text>
            </View>
          </View>

          <View style={styles.statusRow}>
            <View style={styles.statusChip}>
              <Text style={styles.statusChipLabel}>Disponibles</Text>
              <Text style={styles.statusChipValue}>{summary.available}</Text>
            </View>
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
              {summary.lastReportAt
                ? `Último reporte ${getElapsedLabel(summary.lastReportAt)}`
                : "Aún no has enviado reportes."}
            </Text>
            <Pressable
              testID="report-history-refresh-button"
              style={styles.refreshButton}
              onPress={handleRefresh}
              disabled={isRefreshing}
            >
              <Text style={styles.refreshButtonText}>
                {isRefreshing ? "Actualizando..." : "Actualizar"}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.listSection}>
          <Text style={styles.listTitle}>Tus reportes</Text>

          {isLoading ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Cargando historial...</Text>
              <Text style={styles.emptyBody}>
                Estamos recuperando tus reportes más recientes.
              </Text>
            </View>
          ) : reports.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Todavía no has enviado reportes.</Text>
              <Text style={styles.emptyBody}>
                Cuando valides un estacionamiento desde el mapa, aparecerá aquí con
                su estado y la hora del reporte.
              </Text>
            </View>
          ) : (
            reports.map((report) => (
              <View key={report.id} style={styles.reportCard}>
                <View style={styles.reportTopRow}>
                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: `${statusToColor(report.status)}22` },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        { color: statusToColor(report.status) },
                      ]}
                    >
                      {statusToLabel(report.status)}
                    </Text>
                  </View>
                  <Text style={styles.reportElapsed}>{getElapsedLabel(report.createdAt)}</Text>
                </View>

                <Text style={styles.reportPlace}>{report.placeName}</Text>
                <Text style={styles.reportDate}>{formatReportDate(report.createdAt)}</Text>

                <Text style={styles.metaText}>
                  {report.reportedDistanceMeters !== null
                    ? `Distancia al reportar: ${report.reportedDistanceMeters} m`
                    : "Distancia al reportar no disponible"}
                </Text>

                <Text style={styles.reportNote}>
                  {report.note ?? "Sin nota adicional en este reporte."}
                </Text>
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
  reportCard: {
    marginTop: 12,
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  reportTopRow: {
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
  reportElapsed: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "700",
  },
  reportPlace: {
    marginTop: 12,
    fontSize: 18,
    color: "#0f172a",
    fontWeight: "900",
  },
  reportDate: {
    marginTop: 4,
    fontSize: 13,
    color: "#64748b",
    fontWeight: "600",
  },
  metaText: {
    marginTop: 12,
    fontSize: 13,
    color: "#0f172a",
    fontWeight: "700",
  },
  reportNote: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: "#334155",
    fontWeight: "500",
  },
});
