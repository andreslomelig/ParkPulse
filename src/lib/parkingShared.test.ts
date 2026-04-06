import {
  clampLimit,
  normalizeAccessType,
  normalizeCapacityConfidence,
  normalizeCostType,
  normalizeCurrencyCode,
  normalizeParkingReportStatus,
  normalizeParkingStatus,
  normalizeRatingValue,
  toInteger,
  toNumber,
  toTrimmedString,
} from "./parkingShared";

describe("parkingShared", () => {
  it("normalizes strings and numbers safely", () => {
    expect(toTrimmedString("  hola  ")).toBe("hola");
    expect(toTrimmedString("   ")).toBeNull();
    expect(toTrimmedString(42)).toBeNull();

    expect(toNumber(15)).toBe(15);
    expect(toNumber(" 25.5 ")).toBe(25.5);
    expect(toNumber("nan")).toBeNull();

    expect(toInteger(7.9)).toBe(7);
    expect(toInteger("8.1")).toBe(8);
    expect(toInteger(undefined)).toBeNull();
  });

  it("normalizes parking enums and aliases", () => {
    expect(normalizeParkingStatus("disponible")).toBe("available");
    expect(normalizeParkingStatus("lleno")).toBe("full");
    expect(normalizeParkingStatus("cerrado")).toBe("closed");
    expect(normalizeParkingStatus("otro")).toBe("unknown");

    expect(normalizeParkingReportStatus("available")).toBe("available");
    expect(normalizeParkingReportStatus("unknown")).toBeNull();

    expect(normalizeCostType("gratis")).toBe("free");
    expect(normalizeCostType("Pago")).toBe("paid");
    expect(normalizeCostType("mixto")).toBe("mixed");
    expect(normalizeCostType("algo")).toBe("unknown");

    expect(normalizeCapacityConfidence("exact")).toBe("exact");
    expect(normalizeCapacityConfidence("estimado")).toBe("estimated");
    expect(normalizeCapacityConfidence("rango")).toBe("range");
    expect(normalizeCapacityConfidence("otro")).toBe("unknown");

    expect(normalizeAccessType("publico")).toBe("public");
    expect(normalizeAccessType("privado")).toBe("private");
    expect(normalizeAccessType("mixto")).toBe("mixed");
    expect(normalizeAccessType("otro")).toBe("unknown");
  });

  it("normalizes currency, ratings and limits", () => {
    expect(normalizeCurrencyCode(" usd ")).toBe("USD");
    expect(normalizeCurrencyCode("")).toBe("MXN");

    expect(normalizeRatingValue(4.4)).toBe(4);
    expect(normalizeRatingValue(0)).toBeNull();
    expect(normalizeRatingValue(6)).toBeNull();
    expect(normalizeRatingValue(undefined)).toBeNull();

    expect(clampLimit(5, 10)).toBe(5);
    expect(clampLimit(0, 10)).toBe(10);
    expect(clampLimit(Number.NaN, 10)).toBe(10);
  });
});
