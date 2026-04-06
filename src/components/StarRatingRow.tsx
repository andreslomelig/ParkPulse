import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type StarRatingRowProps = {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
  activeColor?: string;
  inactiveColor?: string;
  testIDPrefix?: string;
};

const STAR_VALUES = [1, 2, 3, 4, 5];

export default function StarRatingRow({
  value,
  onChange,
  size = 34,
  activeColor = "#fbbf24",
  inactiveColor = "#cbd5e1",
  testIDPrefix = "star-rating",
}: StarRatingRowProps) {
  return (
    <View style={styles.row}>
      {STAR_VALUES.map((starValue) => {
        const isActive = starValue <= value;
        const starColor = isActive ? activeColor : inactiveColor;
        const starText = isActive ? "\u2605" : "\u2606";

        if (!onChange) {
          return (
            <View key={starValue} style={styles.starSlot}>
              <Text style={[styles.starText, { fontSize: size, color: starColor }]}>
                {starText}
              </Text>
            </View>
          );
        }

        return (
          <Pressable
            key={starValue}
            testID={`${testIDPrefix}-${starValue}`}
            accessibilityRole="button"
            accessibilityLabel={`${starValue} estrellas`}
            style={styles.starSlot}
            onPress={() => onChange(starValue)}
          >
            <Text style={[styles.starText, { fontSize: size, color: starColor }]}>
              {starText}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  starSlot: {
    alignItems: "center",
    justifyContent: "center",
  },
  starText: {
    fontWeight: "700",
  },
});
