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
import type { AuthenticatedAppUser } from "../lib/auth";
import {
  pickProfileAvatarImage,
  uploadProfileAvatar,
  type PickedProfileImage,
} from "../lib/avatarUploads";
import {
  fetchCurrentUserProfile,
  upsertCurrentUserProfile,
  type UserProfile,
} from "../lib/profiles";
import {
  APP_THEME_PALETTES,
  fetchThemePreferenceForUser,
  getThemePalette,
  saveThemePreferenceForUser,
  type AppThemeName,
} from "../lib/themePreferences";
import { isSupabaseConfigured } from "../lib/supabase";

export type ProfileSettingsScreenProps = {
  currentUser: AuthenticatedAppUser;
  onCancel: () => void;
  onProfileSaved: (payload: {
    fullName: string | null;
    phone: string | null;
    avatarUrl: string | null;
    themeName: AppThemeName;
  }) => void;
};

type ProfileFormState = {
  preferredName: string;
  fullName: string;
  phone: string;
  avatarUrl: string;
  themeName: AppThemeName;
};

function getDisplayName(
  currentUser: AuthenticatedAppUser,
  loadedProfile: UserProfile | null
) {
  return (
    loadedProfile?.preferredName ??
    loadedProfile?.fullName ??
    currentUser.fullName ??
    currentUser.email
  );
}

function getInitialFormState(
  currentUser: AuthenticatedAppUser,
  loadedProfile: UserProfile | null,
  themeName: AppThemeName
): ProfileFormState {
  return {
    preferredName: loadedProfile?.preferredName ?? "",
    fullName: loadedProfile?.fullName ?? currentUser.fullName ?? "",
    phone: loadedProfile?.phone ?? currentUser.phone ?? "",
    avatarUrl: loadedProfile?.avatarUrl ?? currentUser.avatarUrl ?? "",
    themeName,
  };
}

export default function ProfileSettingsScreen({
  currentUser,
  onCancel,
  onProfileSaved,
}: ProfileSettingsScreenProps) {
  const [loadedProfile, setLoadedProfile] = useState<UserProfile | null>(null);
  const [formState, setFormState] = useState<ProfileFormState>({
    preferredName: "",
    fullName: currentUser.fullName ?? "",
    phone: currentUser.phone ?? "",
    avatarUrl: currentUser.avatarUrl ?? "",
    themeName: "ocean",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedLocalAvatar, setSelectedLocalAvatar] = useState<PickedProfileImage | null>(
    null
  );

  useEffect(() => {
    let active = true;

    Promise.allSettled([
      fetchThemePreferenceForUser(currentUser.id),
      fetchCurrentUserProfile(),
    ])
      .then(([themeResult, profileResult]) => {
        if (!active) return;

        const nextThemeName = themeResult.status === "fulfilled" ? themeResult.value : "ocean";
        const nextProfile = profileResult.status === "fulfilled" ? profileResult.value : null;

        setLoadedProfile(nextProfile);
        setFormState(getInitialFormState(currentUser, nextProfile, nextThemeName));
        setIsLoading(false);
      })
      .catch((error) => {
        console.error(error);
        if (!active) return;

        setLoadedProfile(null);
        setFormState((currentState) => ({
          ...currentState,
          themeName: "ocean",
        }));
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [currentUser.fullName, currentUser.id, currentUser.phone]);

  const selectedTheme = useMemo(
    () => getThemePalette(formState.themeName),
    [formState.themeName]
  );

  const profilePreviewName =
    formState.preferredName.trim() ||
    formState.fullName.trim() ||
    getDisplayName(currentUser, loadedProfile);

  const handleChange =
    (field: keyof ProfileFormState) =>
    (value: string | AppThemeName) => {
      if (field === "avatarUrl") {
        setSelectedLocalAvatar(null);
      }

      setFormState((currentState) => ({
        ...currentState,
        [field]: value,
      }));
    };

  const handlePickAvatar = async () => {
    try {
      const pickedImage = await pickProfileAvatarImage();
      if (!pickedImage) return;

      setSelectedLocalAvatar(pickedImage);
      setFormState((currentState) => ({
        ...currentState,
        avatarUrl: pickedImage.localUri,
      }));
    } catch (error) {
      console.error(error);
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "No se pudo elegir la foto."
      );
    }
  };

  const handleRemoveAvatar = () => {
    setSelectedLocalAvatar(null);
    setFormState((currentState) => ({
      ...currentState,
      avatarUrl: "",
    }));
  };

  const handleSave = async () => {
    try {
      setIsSubmitting(true);

      const nextThemeName = await saveThemePreferenceForUser(
        currentUser.id,
        formState.themeName
      );

      let nextProfileFullName = formState.fullName.trim() || null;
      let nextProfilePhone = formState.phone.trim() || null;
      let nextProfileAvatarUrl = formState.avatarUrl.trim() || null;
      let profileSavedRemotely = false;

      if (selectedLocalAvatar) {
        if (!isSupabaseConfigured) {
          throw new Error(
            "Para subir una foto desde tu dispositivo necesitas configurar Supabase y el bucket de avatares."
          );
        }

        nextProfileAvatarUrl = await uploadProfileAvatar(selectedLocalAvatar);
      }

      if (isSupabaseConfigured) {
        const nextProfile = await upsertCurrentUserProfile({
          fullName: nextProfileFullName,
          preferredName: formState.preferredName.trim() || null,
          phone: nextProfilePhone,
          avatarUrl: nextProfileAvatarUrl,
        });

        setLoadedProfile(nextProfile);
        nextProfileFullName = nextProfile.preferredName ?? nextProfile.fullName;
        nextProfilePhone = nextProfile.phone;
        nextProfileAvatarUrl = nextProfile.avatarUrl;
        profileSavedRemotely = true;
        setSelectedLocalAvatar(null);
        setFormState((currentState) => ({
          ...currentState,
          avatarUrl: nextProfile.avatarUrl ?? currentState.avatarUrl,
        }));
      }

      onProfileSaved({
        fullName: nextProfileFullName,
        phone: nextProfilePhone,
        avatarUrl: nextProfileAvatarUrl,
        themeName: nextThemeName,
      });

      Alert.alert(
        profileSavedRemotely ? "Perfil actualizado" : "Tema actualizado",
        profileSavedRemotely
          ? "Tus datos y tu estilo ya quedaron guardados."
          : "Tu tema quedo guardado localmente. Para guardar datos del perfil necesitas configurar Supabase."
      );
    } catch (error) {
      console.error(error);
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "No se pudo guardar tu perfil."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: selectedTheme.surface }]}
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
          <View
            style={[
              styles.heroCard,
              { backgroundColor: selectedTheme.primary },
            ]}
          >
            <Text style={[styles.eyebrow, { color: selectedTheme.accentSoft }]}>
              Perfil y tema
            </Text>
            <View style={styles.heroProfileRow}>
              {formState.avatarUrl.trim() ? (
                <Image
                  source={{ uri: formState.avatarUrl.trim() }}
                  style={styles.heroAvatarImage}
                />
              ) : (
                <View
                  style={[
                    styles.heroAvatarFallback,
                    { backgroundColor: selectedTheme.accent },
                  ]}
                >
                  <Text style={styles.heroAvatarFallbackText}>
                    {profilePreviewName
                      .split(" ")
                      .map((part) => part.trim())
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((part) => part[0]?.toUpperCase() ?? "")
                      .join("") || "PP"}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.heroTitle}>{profilePreviewName}</Text>
            <Text style={styles.heroBody}>
              Ajusta como apareces dentro de ParkPulse y elige el estilo visual con el
              que quieres personalizar tu cuenta.
            </Text>

            <View style={styles.heroMetaRow}>
              <View
                style={[
                  styles.heroBadge,
                  { backgroundColor: selectedTheme.accent },
                ]}
              >
                <Text style={styles.heroBadgeText}>{selectedTheme.label}</Text>
              </View>
              <Text style={styles.heroMetaText}>{currentUser.email}</Text>
            </View>
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: selectedTheme.surfaceAlt, borderColor: selectedTheme.accentSoft },
            ]}
          >
            <Text style={[styles.cardTitle, { color: selectedTheme.text }]}>
              Datos del perfil
            </Text>
            <Text style={[styles.cardBody, { color: selectedTheme.textMuted }]}>
              {isSupabaseConfigured
                ? "Estos datos se guardan en tu perfil sincronizado."
                : "Sin Supabase configurado solo podremos guardar el tema localmente."}
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: selectedTheme.textMuted }]}>
                Correo
              </Text>
              <View
                style={[
                  styles.readOnlyField,
                  { backgroundColor: selectedTheme.surface, borderColor: selectedTheme.accentSoft },
                ]}
              >
                <Text style={[styles.readOnlyFieldText, { color: selectedTheme.text }]}>
                  {currentUser.email}
                </Text>
              </View>
              <Text style={[styles.helperText, { color: selectedTheme.textMuted }]}>
                El correo sigue viniendo desde autenticacion.
              </Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: selectedTheme.textMuted }]}>
                Nombre visible
              </Text>
              <TextInput
                testID="profile-preferred-name-input"
                value={formState.preferredName}
                onChangeText={handleChange("preferredName")}
                placeholder="Como quieres que te vea la comunidad"
                placeholderTextColor="#94a3b8"
                style={[
                  styles.textField,
                  { backgroundColor: selectedTheme.surface, borderColor: selectedTheme.accentSoft, color: selectedTheme.text },
                ]}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: selectedTheme.textMuted }]}>
                Nombre completo
              </Text>
              <TextInput
                testID="profile-full-name-input"
                value={formState.fullName}
                onChangeText={handleChange("fullName")}
                placeholder="Tu nombre completo"
                placeholderTextColor="#94a3b8"
                style={[
                  styles.textField,
                  { backgroundColor: selectedTheme.surface, borderColor: selectedTheme.accentSoft, color: selectedTheme.text },
                ]}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: selectedTheme.textMuted }]}>
                Telefono
              </Text>
              <TextInput
                testID="profile-phone-input"
                value={formState.phone}
                onChangeText={handleChange("phone")}
                placeholder="+52 449 123 4567"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
                style={[
                  styles.textField,
                  { backgroundColor: selectedTheme.surface, borderColor: selectedTheme.accentSoft, color: selectedTheme.text },
                ]}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: selectedTheme.textMuted }]}>
                Avatar URL
              </Text>
              <View style={styles.avatarActionsRow}>
                <Pressable
                  testID="pick-profile-avatar-button"
                  style={[styles.inlineActionButton, { backgroundColor: selectedTheme.accentSoft }]}
                  onPress={handlePickAvatar}
                  disabled={isSubmitting || isLoading}
                >
                  <Text style={[styles.inlineActionButtonText, { color: selectedTheme.text }]}>
                    Elegir foto
                  </Text>
                </Pressable>
                <Pressable
                  testID="remove-profile-avatar-button"
                  style={[styles.inlineActionButton, styles.inlineActionButtonMuted]}
                  onPress={handleRemoveAvatar}
                  disabled={isSubmitting || isLoading}
                >
                  <Text style={styles.inlineActionButtonText}>Quitar</Text>
                </Pressable>
              </View>
              <TextInput
                testID="profile-avatar-url-input"
                value={formState.avatarUrl}
                onChangeText={handleChange("avatarUrl")}
                placeholder="https://..."
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
                style={[
                  styles.textField,
                  { backgroundColor: selectedTheme.surface, borderColor: selectedTheme.accentSoft, color: selectedTheme.text },
                ]}
              />
              <Text style={[styles.helperText, { color: selectedTheme.textMuted }]}>
                Puedes pegar una URL manual o elegir una foto desde tu dispositivo.
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: selectedTheme.surfaceAlt, borderColor: selectedTheme.accentSoft },
            ]}
          >
            <Text style={[styles.cardTitle, { color: selectedTheme.text }]}>
              Tema del perfil
            </Text>
            <Text style={[styles.cardBody, { color: selectedTheme.textMuted }]}>
              Elige una personalidad visual para tu cuenta.
            </Text>

            <View style={styles.themeList}>
              {Object.values(APP_THEME_PALETTES).map((themeOption) => {
                const isSelected = themeOption.name === formState.themeName;

                return (
                  <Pressable
                    key={themeOption.name}
                    testID={`profile-theme-${themeOption.name}`}
                    style={[
                      styles.themeCard,
                      {
                        backgroundColor: themeOption.surface,
                        borderColor: isSelected ? themeOption.accent : themeOption.accentSoft,
                      },
                    ]}
                    onPress={() => handleChange("themeName")(themeOption.name)}
                  >
                    <View style={styles.themeSwatchRow}>
                      <View
                        style={[
                          styles.themeSwatch,
                          { backgroundColor: themeOption.primary },
                        ]}
                      />
                      <View
                        style={[
                          styles.themeSwatch,
                          { backgroundColor: themeOption.accent },
                        ]}
                      />
                      <View
                        style={[
                          styles.themeSwatch,
                          { backgroundColor: themeOption.accentSoft },
                        ]}
                      />
                    </View>
                    <Text style={[styles.themeTitle, { color: themeOption.text }]}>
                      {themeOption.label}
                    </Text>
                    <Text
                      style={[styles.themeDescription, { color: themeOption.textMuted }]}
                    >
                      {themeOption.description}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.actionRow}>
            <Pressable
              testID="cancel-profile-settings-button"
              style={[styles.actionButton, styles.secondaryButton]}
              onPress={onCancel}
              disabled={isSubmitting}
            >
              <Text style={styles.secondaryButtonText}>Cancelar</Text>
            </Pressable>
            <Pressable
              testID="save-profile-settings-button"
              style={[
                styles.actionButton,
                styles.primaryButton,
                { backgroundColor: selectedTheme.accent },
                (isSubmitting || isLoading) && styles.disabledButton,
              ]}
              onPress={handleSave}
              disabled={isSubmitting || isLoading}
            >
              <Text style={styles.primaryButtonText}>
                {isLoading ? "Cargando..." : isSubmitting ? "Guardando..." : "Guardar cambios"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 28,
  },
  heroCard: {
    borderRadius: 28,
    padding: 20,
    shadowColor: "#0f172a",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  heroTitle: {
    marginTop: 10,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "900",
    color: "#ffffff",
  },
  heroBody: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: "#e2e8f0",
    fontWeight: "500",
  },
  heroMetaRow: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  heroBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heroBadgeText: {
    fontSize: 12,
    color: "#ffffff",
    fontWeight: "900",
  },
  heroMetaText: {
    flex: 1,
    textAlign: "right",
    fontSize: 13,
    color: "#cbd5e1",
    fontWeight: "600",
  },
  heroProfileRow: {
    marginTop: 16,
  },
  heroAvatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.28)",
  },
  heroAvatarFallback: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  heroAvatarFallbackText: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "900",
  },
  card: {
    marginTop: 16,
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: "900",
  },
  cardBody: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "500",
  },
  fieldGroup: {
    marginTop: 16,
  },
  fieldLabel: {
    marginBottom: 8,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  textField: {
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: "600",
  },
  readOnlyField: {
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  readOnlyFieldText: {
    fontSize: 15,
    fontWeight: "600",
  },
  helperText: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
  },
  themeList: {
    marginTop: 14,
    gap: 12,
  },
  themeCard: {
    borderRadius: 22,
    padding: 14,
    borderWidth: 2,
  },
  themeSwatchRow: {
    flexDirection: "row",
    gap: 8,
  },
  themeSwatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  themeTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "800",
  },
  themeDescription: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  avatarActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  inlineActionButton: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  inlineActionButtonMuted: {
    backgroundColor: "#e2e8f0",
  },
  inlineActionButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0f172a",
  },
  actionRow: {
    marginTop: 18,
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
    backgroundColor: "#0891b2",
  },
  secondaryButton: {
    backgroundColor: "#e2e8f0",
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
  disabledButton: {
    opacity: 0.55,
  },
});
