import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppTheme } from "../theme/AppThemeContext";

type InfoCardProps = {
  title: string;
  body: string;
};

function InfoCard({ title, body }: InfoCardProps) {
  const theme = useAppTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surfaceAlt, borderColor: theme.accentSoft },
      ]}
    >
      <Text style={[styles.cardTitle, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.cardBody, { color: theme.textMuted }]}>{body}</Text>
    </View>
  );
}

export default function PrivacyLegalScreen() {
  const theme = useAppTheme();

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.surface }]}
      edges={["bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { backgroundColor: theme.primary }]}>
          <Text style={[styles.eyebrow, { color: theme.accentSoft }]}>
            Actualizado el 9 de abril de 2026
          </Text>
          <Text style={styles.title}>Política de privacidad</Text>
          <Text style={styles.subtitle}>
            En ParkPulse tratamos la información necesaria para mostrar
            estacionamientos cercanos, validar reportes y mejorar la experiencia
            de uso. No utilizamos estos datos para fines ajenos a la operación y
            evolución del servicio.
          </Text>
        </View>

        <InfoCard
          title="Responsable del servicio"
          body="ParkPulse es una plataforma digital de información sobre estacionamiento mantenida por el equipo responsable de este proyecto académico y de producto para la zona piloto de Aguascalientes, México."
        />
        <InfoCard
          title="Información que recopilamos"
          body="Podemos procesar tu ubicación en primer plano, búsquedas dentro del mapa, reportes de disponibilidad, reseñas, nombre visible, avatar y datos técnicos básicos del dispositivo, como versión de la app y eventos de funcionamiento."
        />
        <InfoCard
          title="Finalidad del tratamiento"
          body="Usamos la información exclusivamente para mostrar lugares cercanos, validar que un reporte provenga de una zona razonable, priorizar resultados relevantes y detectar mejoras de experiencia de usuario, rendimiento y confiabilidad del mapa."
        />
        <InfoCard
          title="Ubicación y validación"
          body="La ubicación solo se solicita cuando la necesitas para centrar el mapa o enviar un reporte. ParkPulse no realiza rastreo continuo en segundo plano y no comercializa datos de ubicación con terceros."
        />
        <InfoCard
          title="Contenido comunitario"
          body="Los reportes y reseñas pueden mostrarse junto con tu nombre visible o alias dentro de la comunidad. Te recomendamos no publicar datos personales sensibles en comentarios, referencias o futuras evidencias."
        />
        <InfoCard
          title="Conservación y seguridad"
          body="Conservamos los datos durante el tiempo razonablemente necesario para operar la plataforma, auditar incidencias y mejorar la experiencia. Aplicamos controles de acceso, almacenamiento protegido y registros técnicos para prevenir usos indebidos."
        />
        <InfoCard
          title="Tus decisiones"
          body="Puedes actualizar tu perfil, cambiar tu foto, modificar tu nombre visible y dejar de compartir nueva información desde la app en cualquier momento. Si necesitas revisión o eliminación de datos asociados a tu cuenta, deberás solicitarlo al equipo responsable del proyecto."
        />
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
    gap: 14,
  },
  hero: {
    backgroundColor: "#0f172a",
    borderRadius: 28,
    padding: 20,
  },
  eyebrow: {
    fontSize: 11,
    color: "#67e8f9",
    fontWeight: "800",
    textTransform: "uppercase",
  },
  title: {
    marginTop: 8,
    fontSize: 28,
    lineHeight: 32,
    color: "#ffffff",
    fontWeight: "900",
  },
  subtitle: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: "#cbd5e1",
    fontWeight: "500",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  cardTitle: {
    fontSize: 16,
    color: "#0f172a",
    fontWeight: "800",
  },
  cardBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: "#475569",
    fontWeight: "500",
  },
});
