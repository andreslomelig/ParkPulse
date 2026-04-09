import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import StarRatingRow from "../components/StarRatingRow";
import type { AuthenticatedAppUser } from "../lib/auth";
import { fetchPlaceById, type ParkingPlace } from "../lib/places";
import { formatRatingBadgeSummary } from "../lib/parkingPresentation";
import { submitParkingRating } from "../lib/ratings";
import { useAppTheme } from "../theme/AppThemeContext";

export type PlaceReviewScreenProps = {
  currentUser: AuthenticatedAppUser;
  placeId: string;
  placeName?: string | null;
  onCancel: () => void;
  onReviewSaved: (placeId: string) => void;
};

function getUserDisplayName(user: AuthenticatedAppUser) {
  return user.fullName ?? user.email;
}

function getUserInitials(user: AuthenticatedAppUser) {
  const displayName = getUserDisplayName(user);
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

export default function PlaceReviewScreen({
  currentUser,
  placeId,
  placeName,
  onCancel,
  onReviewSaved,
}: PlaceReviewScreenProps) {
  const theme = useAppTheme();
  const [place, setPlace] = useState<ParkingPlace | null>(null);
  const [isLoadingPlace, setIsLoadingPlace] = useState(true);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    fetchPlaceById(placeId)
      .then((nextPlace) => {
        if (!active) return;
        setPlace(nextPlace);
        setIsLoadingPlace(false);
      })
      .catch((error) => {
        console.error(error);
        if (!active) return;
        setPlace(null);
        setIsLoadingPlace(false);
      });

    return () => {
      active = false;
    };
  }, [placeId]);

  const resolvedPlaceName = useMemo(() => {
    return place?.name ?? placeName ?? "Estacionamiento";
  }, [place?.name, placeName]);

  const handlePublishReview = async () => {
    if (rating < 1) {
      Alert.alert("Calificación requerida", "Selecciona entre 1 y 5 estrellas.");
      return;
    }

    let didSaveReview = false;

    try {
      setIsSubmitting(true);

      await submitParkingRating({
        placeId,
        rating,
        comment,
      });

      didSaveReview = true;
      setIsSubmitting(false);
      onReviewSaved(placeId);
      Alert.alert(
        "Reseña publicada",
        `${resolvedPlaceName} ya incluye tu calificación en el promedio.`
      );
    } catch (error) {
      console.error(error);
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "No se pudo publicar la reseña."
      );
    } finally {
      if (!didSaveReview) {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.primarySoft }]}
      edges={["bottom"]}
    >
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.heroCard, { backgroundColor: theme.primary }]}>
            <Text style={[styles.eyebrow, { color: theme.accentSoft }]}>Reseña del lugar</Text>
            <Text style={styles.placeName}>{resolvedPlaceName}</Text>
            <Text style={styles.placeMeta}>
              {isLoadingPlace
                ? "Cargando información del estacionamiento..."
                : place
                  ? `${formatRatingBadgeSummary(place)} actual`
                  : "Comparte tu experiencia para ayudar a la comunidad."}
            </Text>
          </View>

          <View
            style={[
              styles.formCard,
              { backgroundColor: theme.surfaceAlt, borderColor: theme.accentSoft },
            ]}
          >
            <View style={styles.profileRow}>
              <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
                {currentUser.avatarUrl ? (
                  <Image
                    source={{ uri: currentUser.avatarUrl }}
                    style={styles.avatarImage}
                  />
                ) : (
                  <Text style={styles.avatarText}>{getUserInitials(currentUser)}</Text>
                )}
              </View>
              <View style={styles.profileCopy}>
                <Text style={[styles.profileName, { color: theme.text }]}>
                  {getUserDisplayName(currentUser)}
                </Text>
                <Text style={[styles.profileSubtitle, { color: theme.textMuted }]}>
                  Compartiendo en ParkPulse
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
                Tu calificación
              </Text>
              <StarRatingRow
                value={rating}
                onChange={setRating}
                size={40}
                testIDPrefix="review-star"
              />
              <Text style={[styles.sectionHint, { color: theme.textMuted }]}>
                Marca de 1 a 5 estrellas según tu experiencia reciente.
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>Descripción</Text>
              <TextInput
                testID="review-comment-input"
                value={comment}
                onChangeText={setComment}
                placeholder="Comparte detalles sobre tu experiencia en este lugar"
                placeholderTextColor="#94a3b8"
                style={[
                  styles.textArea,
                  styles.textAreaMultiline,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.accentSoft,
                    color: theme.text,
                  },
                ]}
                multiline
                maxLength={600}
                textAlignVertical="top"
              />
              <Text style={[styles.characterCounter, { color: theme.textMuted }]}>
                {comment.trim().length}/600
              </Text>
            </View>

            <View style={styles.actionRow}>
              <Pressable
                testID="cancel-review-button"
                style={[
                  styles.actionButton,
                  styles.secondaryButton,
                  { backgroundColor: theme.primarySoft },
                ]}
                onPress={onCancel}
                disabled={isSubmitting}
              >
                <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
                  Cancelar
                </Text>
              </Pressable>
              <Pressable
                testID="publish-review-button"
                style={[
                  styles.actionButton,
                  styles.primaryButton,
                  { backgroundColor: theme.accent },
                  (rating < 1 || isSubmitting) && styles.disabledButton,
                ]}
                onPress={handlePublishReview}
                disabled={rating < 1 || isSubmitting}
              >
                <Text style={styles.primaryButtonText}>
                  {isSubmitting ? "Publicando..." : "Publicar"}
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#e2e8f0",
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 28,
  },
  heroCard: {
    backgroundColor: "#0f172a",
    borderRadius: 28,
    padding: 20,
    shadowColor: "#0f172a",
    shadowOpacity: 0.16,
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
  placeName: {
    marginTop: 10,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "900",
    color: "#f8fafc",
  },
  placeMeta: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: "#cbd5e1",
    fontWeight: "600",
  },
  formCard: {
    marginTop: 16,
    backgroundColor: "#ffffff",
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: "#dbe4ee",
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#0ea5e9",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
  },
  profileCopy: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    color: "#0f172a",
    fontWeight: "900",
  },
  profileSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#64748b",
    fontWeight: "600",
  },
  section: {
    marginTop: 22,
  },
  sectionLabel: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "800",
    textTransform: "uppercase",
  },
  sectionHint: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
    color: "#64748b",
    fontWeight: "500",
  },
  textArea: {
    marginTop: 10,
    minHeight: 140,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#dbe4ee",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 15,
    lineHeight: 22,
    color: "#0f172a",
    fontWeight: "500",
  },
  textAreaMultiline: {
    textAlignVertical: "top",
  },
  characterCounter: {
    marginTop: 8,
    alignSelf: "flex-end",
    fontSize: 12,
    color: "#94a3b8",
    fontWeight: "700",
  },
  actionRow: {
    marginTop: 24,
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    backgroundColor: "#0ea5e9",
  },
  secondaryButton: {
    backgroundColor: "#e2e8f0",
  },
  disabledButton: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButtonText: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "800",
  },
});
