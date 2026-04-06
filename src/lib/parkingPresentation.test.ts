import {
  formatCapacitySummary,
  formatCostSummary,
  formatRatingBadgeSummary,
  formatRatingSummary,
  formatReportVolumeSummary,
} from "./parkingPresentation";

describe("parkingPresentation", () => {
  it("formats cost summaries for free and ranged pricing", () => {
    expect(
      formatCostSummary({
        costType: "free",
        currencyCode: "MXN",
        hourlyCostMin: null,
        hourlyCostMax: null,
        costNotes: null,
      })
    ).toBe("Gratis");

    expect(
      formatCostSummary({
        costType: "paid",
        currencyCode: "MXN",
        hourlyCostMin: 20,
        hourlyCostMax: 30,
        costNotes: null,
      })
    ).toBe("MXN 20-30/h");

    expect(
      formatCostSummary({
        costType: "paid",
        currencyCode: "USD",
        hourlyCostMin: 15,
        hourlyCostMax: null,
        costNotes: null,
      })
    ).toBe("Desde USD 15/h");

    expect(
      formatCostSummary({
        costType: "paid",
        currencyCode: "",
        hourlyCostMin: 20.5,
        hourlyCostMax: 20.5,
        costNotes: null,
      })
    ).toBe("MXN 20.50/h");

    expect(
      formatCostSummary({
        costType: "paid",
        currencyCode: "MXN",
        hourlyCostMin: null,
        hourlyCostMax: 35,
        costNotes: null,
      })
    ).toBe("Hasta MXN 35/h");
  });

  it("falls back to notes or generic copy when pricing is incomplete", () => {
    expect(
      formatCostSummary({
        costType: "mixed",
        currencyCode: "MXN",
        hourlyCostMin: null,
        hourlyCostMax: null,
        costNotes: "Primer tramo gratis",
      })
    ).toBe("Primer tramo gratis");

    expect(
      formatCostSummary({
        costType: "mixed",
        currencyCode: "MXN",
        hourlyCostMin: null,
        hourlyCostMax: null,
        costNotes: null,
      })
    ).toBe("Tarifa mixta");

    expect(
      formatCostSummary({
        costType: "paid",
        currencyCode: "MXN",
        hourlyCostMin: null,
        hourlyCostMax: null,
        costNotes: null,
      })
    ).toBe("Tarifa por validar");

    expect(
      formatCostSummary({
        costType: "unknown",
        currencyCode: "MXN",
        hourlyCostMin: null,
        hourlyCostMax: null,
        costNotes: null,
      })
    ).toBe("Sin datos");
  });

  it("formats capacity, ratings and report volume", () => {
    expect(formatCapacitySummary({ capacityMin: 20, capacityMax: 20 })).toBe(
      "20 autos"
    );
    expect(formatCapacitySummary({ capacityMin: 20, capacityMax: 40 })).toBe(
      "20-40 autos"
    );
    expect(formatCapacitySummary({ capacityMin: 20, capacityMax: null })).toBe(
      "20+ autos"
    );
    expect(formatCapacitySummary({ capacityMin: null, capacityMax: 40 })).toBe(
      "Hasta 40 autos"
    );
    expect(formatCapacitySummary({ capacityMin: null, capacityMax: null })).toBe(
      "Por validar"
    );

    expect(formatRatingSummary({ averageRating: null, ratingCount: 0 })).toBe(
      "Sin calificaciones"
    );
    expect(formatRatingSummary({ averageRating: 4.25, ratingCount: 18 })).toBe(
      "4.3/5 (18)"
    );
    expect(
      formatRatingBadgeSummary({ averageRating: 4.25, ratingCount: 18 })
    ).toBe("4.3 / 5 (18)");
    expect(
      formatRatingBadgeSummary({ averageRating: null, ratingCount: 0 })
    ).toBe("Sin calificaciones");

    expect(formatReportVolumeSummary({ totalReportCount: 0 })).toBe(
      "Sin reportes"
    );
    expect(formatReportVolumeSummary({ totalReportCount: 1 })).toBe(
      "1 reporte"
    );
    expect(formatReportVolumeSummary({ totalReportCount: 5 })).toBe(
      "5 reportes"
    );
  });
});
