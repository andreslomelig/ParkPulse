import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type InfoCardProps = {
  title: string;
  body: string;
};

function InfoCard({ title, body }: InfoCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{body}</Text>
    </View>
  );
}

export default function PrivacyLegalScreen() {
  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Demo academica</Text>
          <Text style={styles.title}>Privacidad y legal</Text>
          <Text style={styles.subtitle}>
            Esta pantalla resume de forma clara como se usa la informacion dentro
            del MVP de ParkPulse.
          </Text>
        </View>

        <InfoCard
          title="Que es ParkPulse"
          body="ParkPulse es una demo educativa para visualizar estacionamientos y reportes comunitarios de disponibilidad dentro de una zona piloto en Aguascalientes."
        />
        <InfoCard
          title="Datos que puede usar la app"
          body="La app puede usar tu ubicacion mientras esta abierta para centrar el mapa y validar si estas cerca del lugar que quieres reportar. Tambien puede guardar el estado que reportes sobre un estacionamiento."
        />
        <InfoCard
          title="Uso de ubicacion"
          body="La ubicacion se usa para mostrar lugares cercanos y para evitar reportes enviados desde muy lejos. En esta etapa no hay funciones de navegacion interna ni rastreo en segundo plano."
        />
        <InfoCard
          title="Contenido comunitario"
          body="Los estados de Disponible, Lleno o Cerrado pueden venir de la comunidad. Por eso la informacion es orientativa y puede cambiar rapidamente."
        />
        <InfoCard
          title="Alcance de la demo"
          body="Esta version no administra pagos, reservas ni garantias de disponibilidad. Tampoco reemplaza informacion oficial del estacionamiento o de autoridades locales."
        />
        <InfoCard
          title="Uso responsable"
          body="No compartas datos personales sensibles en nombres, notas o futuras fotos. Si una ubicacion es incorrecta, debe corregirse antes de considerarse informacion confiable."
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
