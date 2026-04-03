import {
  fetchRecentReports,
  fetchReportsForPlace,
  normalizeSubmitParkingReportInput,
  submitParkingReport,
} from "./reports";
import {
  getSupabaseClient,
  requireSupabaseClient,
} from "./supabase";

jest.mock("./communitySession", () => ({
  getCommunitySessionId: jest.fn(() => "session-123"),
}));

jest.mock("./supabase", () => ({
  getSupabaseClient: jest.fn(),
  requireSupabaseClient: jest.fn(),
}));

describe("reports", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("normalizes and validates report payloads", () => {
    expect(
      normalizeSubmitParkingReportInput({
        placeId: " place-1 ",
        placeName: " Lugar ",
        status: "available",
        note: "  ok  ",
        reportedDistanceMeters: 14.7,
        rating: 5,
      })
    ).toEqual(
      expect.objectContaining({
        placeId: "place-1",
        placeName: "Lugar",
        note: "ok",
        reporterSessionId: "session-123",
        reportedDistanceMeters: 14,
        rating: 5,
      })
    );

    expect(() =>
      normalizeSubmitParkingReportInput({
        placeId: "",
        placeName: "Lugar",
        status: "available",
      })
    ).toThrow("El reporte necesita un estacionamiento valido.");

    expect(() =>
      normalizeSubmitParkingReportInput({
        placeId: "place-1",
        placeName: "Lugar",
        status: "unknown" as never,
      })
    ).toThrow("El estado del reporte es invalido.");

    expect(() =>
      normalizeSubmitParkingReportInput({
        placeId: "place-1",
        placeName: "Lugar",
        status: "available",
        rating: 9,
      })
    ).toThrow("La calificacion del reporte debe estar entre 1 y 5.");
  });

  it("returns fallback recent reports without supabase", async () => {
    (getSupabaseClient as jest.Mock).mockReturnValue(null);

    const reports = await fetchRecentReports();
    const filteredReports = await fetchReportsForPlace("fallback-1");

    expect(reports).toHaveLength(2);
    expect(filteredReports[0]?.placeId).toBe("fallback-1");
  });

  it("reads recent reports from the feed and handles feed errors", async () => {
    const successClient = {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({
              data: [
                {
                  id: "report-1",
                  place_id: "place-1",
                  place_name: "Lugar",
                  status: "full",
                  note: "sin espacio",
                  created_at: "2026-03-19T18:00:00.000Z",
                },
              ],
              error: null,
            }),
          }),
        })),
      })),
    };
    const errorClient = {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({
              data: null,
              error: { message: "feed error" },
            }),
          }),
        })),
      })),
    };

    (getSupabaseClient as jest.Mock).mockReturnValue(successClient);
    await expect(fetchRecentReports(5)).resolves.toEqual([
      expect.objectContaining({
        id: "report-1",
        status: "full",
        note: "sin espacio",
      }),
    ]);

    (getSupabaseClient as jest.Mock).mockReturnValue(errorClient);
    await expect(fetchRecentReports(5)).resolves.toEqual([]);
  });

  it("maps partial report rows with safe defaults", async () => {
    const client = {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({
              data: [
                {
                  status: "available",
                },
                {
                  id: "discard-me",
                  status: "unknown",
                },
              ],
              error: null,
            }),
          }),
        })),
      })),
    };

    (getSupabaseClient as jest.Mock).mockReturnValue(client);

    const reports = await fetchRecentReports(3);

    expect(reports).toHaveLength(1);
    expect(reports[0]).toEqual(
      expect.objectContaining({
        id: expect.stringContaining("report-"),
        placeId: "unknown-place",
        placeName: "Estacionamiento",
        status: "available",
      })
    );
    expect(typeof reports[0]?.createdAt).toBe("string");
  });

  it("returns empty collections when remote report queries return null data", async () => {
    const client = {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        })),
      })),
      rpc: jest.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    };

    (getSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(fetchRecentReports(5)).resolves.toEqual([]);
    await expect(fetchReportsForPlace("place-1", 10)).resolves.toEqual([]);
  });

  it("reads place-specific history from the rpc endpoint", async () => {
    const client = {
      rpc: jest.fn().mockResolvedValue({
        data: [
          {
            id: "report-2",
            place_id: "place-1",
            place_name: "Lugar",
            status: "available",
            created_at: "2026-03-19T18:01:00.000Z",
          },
        ],
        error: null,
      }),
    };

    (getSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(fetchReportsForPlace(" ", 10)).resolves.toEqual([]);
    await expect(fetchReportsForPlace("place-1", 10)).resolves.toEqual([
      expect.objectContaining({
        id: "report-2",
        status: "available",
      }),
    ]);
  });

  it("returns an empty history collection when the rpc fails", async () => {
    const client = {
      rpc: jest.fn().mockResolvedValue({
        data: null,
        error: { message: "rpc failed" },
      }),
    };

    (getSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(fetchReportsForPlace("place-1", 10)).resolves.toEqual([]);
  });

  it("creates reports through the rpc endpoint", async () => {
    const client = {
      rpc: jest.fn().mockResolvedValue({
        data: [
          {
            id: "created-report-1",
            place_id: "place-1",
            place_name: "Lugar",
            status: "closed",
            created_at: "2026-03-19T18:05:00.000Z",
          },
        ],
        error: null,
      }),
    };

    (requireSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(
      submitParkingReport({
        placeId: "place-1",
        placeName: "Lugar",
        status: "closed",
      })
    ).resolves.toEqual(
      expect.objectContaining({
        id: "created-report-1",
        status: "closed",
      })
    );
  });

  it("accepts non-array rpc payloads when creating reports", async () => {
    const client = {
      rpc: jest.fn().mockResolvedValue({
        data: {
          id: "created-report-2",
          place_id: "place-1",
          status: "available",
        },
        error: null,
      }),
    };

    (requireSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(
      submitParkingReport({
        placeId: "place-1",
        placeName: "Lugar",
        status: "available",
      })
    ).resolves.toEqual(
      expect.objectContaining({
        id: "created-report-2",
        placeName: "Estacionamiento",
      })
    );
  });

  it("throws a parsing error when the create-report rpc returns no row", async () => {
    const client = {
      rpc: jest.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    };

    (requireSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(
      submitParkingReport({
        placeId: "place-1",
        placeName: "Lugar",
        status: "available",
      })
    ).rejects.toThrow("No se pudo interpretar el reporte creado.");
  });

  it("surfaces rpc and parsing errors when creating reports", async () => {
    const errorClient = {
      rpc: jest.fn().mockResolvedValue({
        data: null,
        error: { message: "create failed" },
      }),
    };
    const malformedClient = {
      rpc: jest.fn().mockResolvedValue({
        data: [{ id: "bad-report" }],
        error: null,
      }),
    };

    (requireSupabaseClient as jest.Mock).mockReturnValue(errorClient);
    await expect(
      submitParkingReport({
        placeId: "place-1",
        placeName: "Lugar",
        status: "available",
      })
    ).rejects.toThrow("create failed");

    (requireSupabaseClient as jest.Mock).mockReturnValue(malformedClient);
    await expect(
      submitParkingReport({
        placeId: "place-1",
        placeName: "Lugar",
        status: "available",
      })
    ).rejects.toThrow("No se pudo interpretar el reporte creado.");
  });
});
