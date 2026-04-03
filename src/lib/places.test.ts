import {
  createParkingPlace,
  fetchPlaceById,
  fetchPlaces,
  limitPlaces,
  normalizeCreateParkingPlaceInput,
} from "./places";
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

function buildSelectQuery(result: unknown) {
  return {
    order: jest.fn().mockResolvedValue(result),
    eq: jest.fn().mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue(result),
    }),
    maybeSingle: jest.fn().mockResolvedValue(result),
  };
}

describe("places", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("normalizes and validates create-place payloads", () => {
    expect(
      normalizeCreateParkingPlaceInput({
        name: " Nuevo lugar ",
        latitude: "21.1" as unknown as number,
        longitude: "-102.3" as unknown as number,
        hourlyCostMin: 10,
        hourlyCostMax: 20,
        capacityMin: 50,
        capacityMax: 70,
      })
    ).toEqual(
      expect.objectContaining({
        name: "Nuevo lugar",
        latitude: 21.1,
        longitude: -102.3,
        createdBySessionId: "session-123",
      })
    );

    expect(() =>
      normalizeCreateParkingPlaceInput({
        name: " ",
        latitude: 1,
        longitude: 2,
      })
    ).toThrow("El nombre del estacionamiento es obligatorio.");

    expect(() =>
      normalizeCreateParkingPlaceInput({
        name: "Lugar",
        latitude: Number.NaN,
        longitude: 2,
      })
    ).toThrow("Las coordenadas del estacionamiento son invalidas.");

    expect(() =>
      normalizeCreateParkingPlaceInput({
        name: "Lugar",
        latitude: 1,
        longitude: 2,
        hourlyCostMin: 20,
        hourlyCostMax: 10,
      })
    ).toThrow("El costo maximo no puede ser menor al costo minimo.");

    expect(() =>
      normalizeCreateParkingPlaceInput({
        name: "Lugar",
        latitude: 1,
        longitude: 2,
        capacityMin: 20,
        capacityMax: 10,
      })
    ).toThrow("La capacidad maxima no puede ser menor a la minima.");
  });

  it("returns fallback places when supabase is unavailable", async () => {
    (getSupabaseClient as jest.Mock).mockReturnValue(null);

    const places = await fetchPlaces();
    const place = await fetchPlaceById("fallback-1");

    expect(places).toHaveLength(3);
    expect(place?.id).toBe("fallback-1");
  });

  it("reads places from the live-status view", async () => {
    const client = {
      from: jest.fn(() => ({
        select: jest.fn(() =>
          buildSelectQuery({
            data: [
              {
                id: "remote-1",
                name: "Lugar remoto",
                latitude: 21.88,
                longitude: -102.29,
                current_status: "available",
                average_rating: "4.50",
                rating_count: "8",
              },
            ],
            error: null,
          })
        ),
      })),
    };

    (getSupabaseClient as jest.Mock).mockReturnValue(client);

    const places = await fetchPlaces();

    expect(places).toEqual([
      expect.objectContaining({
        id: "remote-1",
        name: "Lugar remoto",
        status: "available",
        averageRating: 4.5,
        ratingCount: 8,
      }),
    ]);
  });

  it("fills missing place fields with safe defaults while mapping", async () => {
    const client = {
      from: jest.fn(() => ({
        select: jest.fn(() =>
          buildSelectQuery({
            data: [
              {
                latitude: 21.5,
                longitude: -102.4,
                status: "closed",
              },
            ],
            error: null,
          })
        ),
      })),
    };

    (getSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(fetchPlaces()).resolves.toEqual([
      expect.objectContaining({
        id: "generated-21.5--102.4",
        name: "Estacionamiento",
        status: "closed",
      }),
    ]);
  });

  it("falls back to the base table when the live view fails", async () => {
    const liveQuery = buildSelectQuery({
      data: null,
      error: { message: "view error" },
    });
    const tableQuery = buildSelectQuery({
      data: [
        {
          id: "remote-2",
          name: "Lugar base",
          latitude: 21.9,
          longitude: -102.25,
          current_status: "full",
        },
      ],
      error: null,
    });

    const client = {
      from: jest.fn((table: string) => ({
        select: jest.fn(() => (table === "place_live_status" ? liveQuery : tableQuery)),
      })),
    };

    (getSupabaseClient as jest.Mock).mockReturnValue(client);

    const places = await fetchPlaces();

    expect(places[0]).toEqual(
      expect.objectContaining({
        id: "remote-2",
        status: "full",
      })
    );
  });

  it("returns fallback places when both remote sources fail", async () => {
    const brokenQuery = buildSelectQuery({
      data: null,
      error: { message: "broken source" },
    });
    const client = {
      from: jest.fn(() => ({
        select: jest.fn(() => brokenQuery),
      })),
    };

    (getSupabaseClient as jest.Mock).mockReturnValue(client);

    const places = await fetchPlaces();

    expect(places).toHaveLength(3);
  });

  it("returns fallback places when both remote sources are empty", async () => {
    const emptyQuery = buildSelectQuery({
      data: null,
      error: null,
    });
    const client = {
      from: jest.fn(() => ({
        select: jest.fn(() => emptyQuery),
      })),
    };

    (getSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(fetchPlaces()).resolves.toHaveLength(3);
  });

  it("returns null for blank ids and maps a selected remote place", async () => {
    const placeQuery = buildSelectQuery({
      data: {
        id: "remote-3",
        name: "Detalle",
        latitude: 21.8,
        longitude: -102.2,
        current_status: "closed",
      },
      error: null,
    });
    const client = {
      from: jest.fn(() => ({
        select: jest.fn(() => placeQuery),
      })),
    };

    (getSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(fetchPlaceById(" ")).resolves.toBeNull();
    await expect(fetchPlaceById("remote-3")).resolves.toEqual(
      expect.objectContaining({
        id: "remote-3",
        status: "closed",
      })
    );
  });

  it("returns null when loading a selected place fails", async () => {
    const client = {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue({
              data: null,
              error: { message: "query error" },
            }),
          })),
        })),
      })),
    };

    (getSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(fetchPlaceById("remote-3")).resolves.toBeNull();
  });

  it("returns null when the selected-place query resolves without a row", async () => {
    const client = {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          })),
        })),
      })),
    };

    (getSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(fetchPlaceById("remote-3")).resolves.toBeNull();
  });

  it("returns null when a fallback place id is not found locally", async () => {
    (getSupabaseClient as jest.Mock).mockReturnValue(null);

    await expect(fetchPlaceById("missing-place")).resolves.toBeNull();
  });

  it("creates a place through the rpc endpoint", async () => {
    const client = {
      rpc: jest.fn().mockResolvedValue({
        data: [
          {
            id: "created-1",
            name: "Creado",
            latitude: 21.7,
            longitude: -102.1,
            current_status: "unknown",
          },
        ],
        error: null,
      }),
    };
    (requireSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(
      createParkingPlace({
        name: "Creado",
        latitude: 21.7,
        longitude: -102.1,
      })
    ).resolves.toEqual(
      expect.objectContaining({
        id: "created-1",
        name: "Creado",
      })
    );
  });

  it("accepts non-array rpc payloads when creating places", async () => {
    const client = {
      rpc: jest.fn().mockResolvedValue({
        data: {
          id: "created-2",
          latitude: 21.6,
          longitude: -102.6,
          current_status: "available",
        },
        error: null,
      }),
    };
    (requireSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(
      createParkingPlace({
        name: "Otro lugar",
        latitude: 21.6,
        longitude: -102.6,
      })
    ).resolves.toEqual(
      expect.objectContaining({
        id: "created-2",
        name: "Estacionamiento",
      })
    );
  });

  it("surfaces rpc and parsing errors when creating a place", async () => {
    const errorClient = {
      rpc: jest.fn().mockResolvedValue({
        data: null,
        error: { message: "rpc failed" },
      }),
    };
    const malformedClient = {
      rpc: jest.fn().mockResolvedValue({
        data: [{ id: "bad-response" }],
        error: null,
      }),
    };

    (requireSupabaseClient as jest.Mock).mockReturnValue(errorClient);
    await expect(
      createParkingPlace({
        name: "Lugar",
        latitude: 1,
        longitude: 2,
      })
    ).rejects.toThrow("rpc failed");

    (requireSupabaseClient as jest.Mock).mockReturnValue(malformedClient);
    await expect(
      createParkingPlace({
        name: "Lugar",
        latitude: 1,
        longitude: 2,
      })
    ).rejects.toThrow("No se pudo interpretar el estacionamiento creado.");

    (requireSupabaseClient as jest.Mock).mockReturnValue({
      rpc: jest.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    });
    await expect(
      createParkingPlace({
        name: "Lugar",
        latitude: 1,
        longitude: 2,
      })
    ).rejects.toThrow("No se pudo interpretar el estacionamiento creado.");
  });

  it("limits place collections safely", () => {
    expect(limitPlaces([{ id: "1" } as never, { id: "2" } as never], 1)).toHaveLength(1);
    expect(limitPlaces([{ id: "1" } as never], 0)).toHaveLength(1);
    expect(limitPlaces([], 5)).toHaveLength(0);
  });
});
