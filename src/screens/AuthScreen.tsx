import React, { useState } from "react";
import {
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
import { isSupabaseConfigured } from "../lib/supabase";
import { signInWithPassword, signUpWithPassword } from "../lib/auth";

type AuthMode = "login" | "signup";
type FeedbackTone = "neutral" | "error" | "success";

type FeedbackState = {
  tone: FeedbackTone;
  message: string;
} | null;

export default function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setFeedback(null);
    setPassword("");
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      setFeedback(null);

      if (mode === "signup") {
        const result = await signUpWithPassword({
          fullName,
          email,
          phone,
          password,
        });

        if (result.needsEmailConfirmation) {
          setFeedback({
            tone: "success",
            message:
              "Tu cuenta fue creada. Revisa tu correo para confirmar y luego inicia sesion.",
          });
          setMode("login");
          setPassword("");
          return;
        }

        setFeedback({
          tone: "success",
          message: "Cuenta creada correctamente. Entrando a ParkPulse...",
        });
        return;
      }

      await signInWithPassword({ email, password });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "No se pudo completar la autenticacion.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSignUp = mode === "signup";
  const submitLabel = isSubmitting
    ? "Procesando..."
    : isSignUp
      ? "Crear cuenta"
      : "Entrar";

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>ParkPulse</Text>
            <Text style={styles.title}>Accede para ver el mapa y reportar lugares.</Text>
            <Text style={styles.subtitle}>
              Crea tu cuenta o inicia sesion para usar todas las funciones.
            </Text>
          </View>

          {!isSupabaseConfigured ? (
            <View style={[styles.feedbackCard, styles.feedbackNeutral]}>
              <Text style={styles.feedbackText}>
                Configura `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY`
                para autenticar usuarios.
              </Text>
            </View>
          ) : null}

          <View style={styles.modeRow}>
            <Pressable
              testID="auth-mode-login"
              style={[styles.modeButton, !isSignUp && styles.modeButtonActive]}
              onPress={() => switchMode("login")}
            >
              <Text style={[styles.modeButtonText, !isSignUp && styles.modeButtonTextActive]}>
                Entrar
              </Text>
            </Pressable>
            <Pressable
              testID="auth-mode-signup"
              style={[styles.modeButton, isSignUp && styles.modeButtonActive]}
              onPress={() => switchMode("signup")}
            >
              <Text style={[styles.modeButtonText, isSignUp && styles.modeButtonTextActive]}>
                Crear cuenta
              </Text>
            </Pressable>
          </View>

          <View style={styles.formCard}>
            {isSignUp ? (
              <View style={styles.formGroup}>
                <Text style={styles.label}>Nombre completo</Text>
                <TextInput
                  testID="auth-full-name-input"
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Tu nombre completo"
                  autoCapitalize="words"
                  style={styles.input}
                />
              </View>
            ) : null}

            <View style={styles.formGroup}>
              <Text style={styles.label}>Correo</Text>
              <TextInput
                testID="auth-email-input"
                value={email}
                onChangeText={setEmail}
                placeholder="correo@ejemplo.com"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                style={styles.input}
              />
            </View>

            {isSignUp ? (
              <View style={styles.formGroup}>
                <Text style={styles.label}>Telefono</Text>
                <TextInput
                  testID="auth-phone-input"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+52 449 123 4567"
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  style={styles.input}
                />
              </View>
            ) : null}

            <View style={styles.formGroup}>
              <Text style={styles.label}>Contrasena</Text>
              <TextInput
                testID="auth-password-input"
                value={password}
                onChangeText={setPassword}
                placeholder="Tu contrasena"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType={isSignUp ? "newPassword" : "password"}
                style={styles.input}
              />
            </View>

            {isSignUp ? (
              <Text style={styles.helper}>
                Usa 8 a 20 caracteres, al menos una mayuscula, un numero y un signo.
              </Text>
            ) : null}

            {feedback ? (
              <View
                testID="auth-feedback"
                style={[
                  styles.feedbackCard,
                  feedback.tone === "error"
                    ? styles.feedbackError
                    : feedback.tone === "success"
                      ? styles.feedbackSuccess
                      : styles.feedbackNeutral,
                ]}
              >
                <Text style={styles.feedbackText}>{feedback.message}</Text>
              </View>
            ) : null}

            <Pressable
              testID="auth-submit-button"
              style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              <Text style={styles.submitButtonText}>{submitLabel}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#e2e8f0" },
  container: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  hero: { marginBottom: 22 },
  eyebrow: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0369a1",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  title: {
    marginTop: 10,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "900",
    color: "#0f172a",
  },
  subtitle: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    color: "#334155",
    fontWeight: "500",
  },
  modeRow: {
    flexDirection: "row",
    backgroundColor: "#cbd5e1",
    borderRadius: 18,
    padding: 4,
    gap: 6,
  },
  modeButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  modeButtonActive: {
    backgroundColor: "#0f172a",
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#334155",
  },
  modeButtonTextActive: {
    color: "#ffffff",
  },
  formCard: {
    marginTop: 18,
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  formGroup: {
    marginTop: 14,
  },
  label: {
    marginBottom: 6,
    fontSize: 12,
    fontWeight: "800",
    color: "#475569",
    textTransform: "uppercase",
  },
  input: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#0f172a",
    fontWeight: "600",
    backgroundColor: "#f8fafc",
  },
  helper: {
    marginTop: 12,
    fontSize: 12,
    lineHeight: 18,
    color: "#475569",
    fontWeight: "500",
  },
  feedbackCard: {
    marginTop: 14,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  feedbackNeutral: {
    backgroundColor: "#e0f2fe",
  },
  feedbackError: {
    backgroundColor: "#fee2e2",
  },
  feedbackSuccess: {
    backgroundColor: "#dcfce7",
  },
  feedbackText: {
    fontSize: 13,
    lineHeight: 18,
    color: "#0f172a",
    fontWeight: "600",
  },
  submitButton: {
    marginTop: 18,
    backgroundColor: "#0f172a",
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: "center",
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#ffffff",
  },
});
