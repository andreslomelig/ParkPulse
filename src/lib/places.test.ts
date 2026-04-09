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
  const resolved = Promise.resolve(result);

  return {
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
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
        openingHours: {
          monday: "8:00",
          saturday: null,
        },
        closingHours: {
          monday: "18:30",
          saturday: null,
        },
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
        openingHours: {
          monday: "08:00",
          saturday: null,
        },
        closingHours: {
          monday: "18:30",
          saturday: null,
        },
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
    ).toThrow("Las coordenadas del estacionamiento son inválidas.");

    expect(() =>
      normalizeCreateParkingPlaceInput({
        name: "Lugar",
        latitude: 1,
        longitude: 2,
        openingHours: {
          monday: "08:00",
        },
      })
    ).toThrow("El horario semanal necesita apertura y cierre por día.");

    expect(() =>
      normalizeCreateParkingPlaceInput({
        name: "Lugar",
        latitude: 1,
        longitude: 2,
        openingHours: {
          monday: "08:00",
        },
        closingHours: {
          monday: "07:30",
        },
      })
    ).toThrow("La hora de cierre del lunes debe ser posterior a la de apertura.");

    expect(() =>
      normalizeCreateParkingPlaceInput({
        name: "Lugar",
        latitude: 1,
        longitude: 2,
        hourlyCostMin: 20,
        hourlyCostMax: 10,
      })
    ).toThrow("El costo máximo no puede ser menor al costo mínimo.");

    expect(() =>
      normalizeCreateParkingPlaceInput({
        name: "Lugar",
        latitude: 1,
        longitude: 2,
        capacityMin: 20,
        capacityMax: 10,
      })
    ).toThrow("La capacidad máxima no puede ser menor a la mínima.");
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
                opening_hours: {
                  monday: "08:00",
                  sunday: null,
                },
                closing_hours: {
                  monday: "20:00",
                  sunday: null,
                },
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
        openingHours: {
          monday: "08:00",
          sunday: null,
        },
        closingHours: {
          monday: "20:00",
          sunday: null,
        },
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

  it("retries the live-status view with a legacy select when new columns are missing", async () => {
    const richViewQuery = buildSelectQuery({
      data: null,
      error: { message: "column place_live_status.description does not exist" },
    });
    const legacyViewQuery = buildSelectQuery({
      data: [
        {
          id: "legacy-view-1",
          name: "Legacy view",
          latitude: 21.7,
          longitude: -102.4,
          current_status: "available",
        },
      ],
      error: null,
    });
    const client = {
      from: jest.fn(() => ({
        select: jest.fn((selectClause: string) =>
          selectClause.includes("description") ? richViewQuery : legacyViewQuery
        ),
      })),
    };

    (getSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(fetchPlaces()).resolves.toEqual([
      expect.objectContaining({
        id: "legacy-view-1",
        name: "Legacy view",
      }),
    ]);
  });

  it("returns fallback places when the legacy live-status query resolves with null data", async () => {
    const richViewQuery = buildSelectQuery({
      data: null,
      error: { message: "column place_live_status.description does not exist" },
    });
    const legacyViewQuery = buildSelectQuery({
      data: null,
      error: null,
    });
    const client = {
      from: jest.fn(() => ({
        select: jest.fn((selectClause: string) =>
          selectClause.includes("description") ? richViewQuery : legacyViewQuery
        ),
      })),
    };

    (getSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(fetchPlaces()).resolves.toHaveLength(3);
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

  it("falls back to the base table when the legacy live-status select also fails", async () => {
    const liveQuery = buildSelectQuery({
      data: null,
      error: { message: "column place_live_status.description does not exist" },
    });
    const legacyLiveQuery = buildSelectQuery({
      data: null,
      error: { message: "legacy live failed" },
    });
    const tableQuery = buildSelectQuery({
      data: [
        {
          id: "remote-legacy-table",
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
        select: jest.fn((selectClause: string) => {
          if (table === "place_live_status") {
            return selectClause.includes("description") ? liveQuery : legacyLiveQuery;
          }

          return tableQuery;
        }),
      })),
    };

    (getSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(fetchPlaces()).resolves.toEqual([
      expect.objectContaining({
        id: "remote-legacy-table",
        status: "full",
      }),
    ]);
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

  it("retries the base table with a legacy select when new columns are missing", async () => {
    const viewQuery = buildSelectQuery({
      data: null,
      error: { message: "view error" },
    });
    const richTableQuery = buildSelectQuery({
      data: null,
      error: { message: "column places.description does not exist" },
    });
    const legacyTableQuery = buildSelectQuery({
      data: [
        {
          id: "legacy-table-1",
          name: "Legacy table",
          latitude: 21.8,
          longitude: -102.31,
          current_status: "closed",
        },
      ],
      error: null,
    });
    const client = {
      from: jest.fn((table: string) => ({
        select: jest.fn((selectClause: string) => {
          if (table === "place_live_status") return viewQuery;
          return selectClause.includes("description") ? richTableQuery : legacyTableQuery;
        }),
      })),
    };

    (getSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(fetchPlaces()).resolves.toEqual([
      expect.objectContaining({
        id: "legacy-table-1",
        status: "closed",
      }),
    ]);
  });

  it("returns fallback places when the legacy base-table query resolves with null data", async () => {
    const viewQuery = buildSelectQuery({
      data: null,
      error: { message: "view error" },
    });
    const richTableQuery = buildSelectQuery({
      data: null,
      error: { message: "column places.description does not exist" },
    });
    const legacyTableQuery = buildSelectQuery({
      data: null,
      error: null,
    });
    const client = {
      from: jest.fn((table: string) => ({
        select: jest.fn((selectClause: string) => {
          if (table === "place_live_status") return viewQuery;
          return selectClause.includes("description") ? richTableQuery : legacyTableQuery;
        }),
      })),
    };

    (getSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(fetchPlaces()).resolves.toHaveLength(3);
  });

  it("returns fallback data when the legacy base-table select also fails", async () => {
    const viewQuery = buildSelectQuery({
      data: null,
      error: { message: "view error" },
    });
    const richTableQuery = buildSelectQuery({
      data: null,
      error: { message: "column places.description does not exist" },
    });
    const legacyTableQuery = buildSelectQuery({
      data: null,
      error: { message: "legacy table failed" },
    });
    const client = {
      from: jest.fn((table: string) => ({
        select: jest.fn((selectClause: string) => {
          if (table === "place_live_status") return viewQuery;
          return selectClause.includes("description") ? richTableQuery : legacyTableQuery;
        }),
      })),
    };

    (getSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(fetchPlaces()).resolves.toHaveLength(3);
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

  it("retries fetchPlaceById with a legacy select when the rich view is stale", async () => {
    const client = {
      from: jest.fn(() => ({
        select: jest.fn((selectClause: string) => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue(
              selectClause.includes("description")
                ? {
                    data: null,
                    error: {
                      message:
                        "column place_live_status.description does not exist",
                    },
                  }
                : {
                    data: {
                      id: "legacy-place-1",
                      name: "Legacy place",
                      latitude: 21.8,
                      longitude: -102.2,
                      current_status: "closed",
                    },
                    error: null,
                  }
            ),
          })),
        })),
      })),
    };

    (getSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(fetchPlaceById("legacy-place-1")).resolves.toEqual(
      expect.objectContaining({
        id: "legacy-place-1",
        name: "Legacy place",
      })
    );
  });

  it("returns null when the legacy fetchPlaceById query resolves with null data", async () => {
    const client = {
      from: jest.fn(() => ({
        select: jest.fn((selectClause: string) => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue(
              selectClause.includes("description")
                ? {
                    data: null,
                    error: {
                      message:
                        "column place_live_status.description does not exist",
                    },
                  }
                : {
                    data: null,
                    error: null,
                  }
            ),
          })),
        })),
      })),
    };

    (getSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(fetchPlaceById("legacy-place-1")).resolves.toBeNull();
  });

  it("returns null when the legacy fetchPlaceById select also fails", async () => {
    const client = {
      from: jest.fn(() => ({
        select: jest.fn((selectClause: string) => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue(
              selectClause.includes("description")
                ? {
                    data: null,
                    error: {
                      message:
                        "column place_live_status.description does not exist",
                    },
                  }
                : {
                    data: null,
                    error: { message: "legacy place failed" },
                  }
            ),
          })),
        })),
      })),
    };

    (getSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(fetchPlaceById("legacy-place-1")).resolves.toBeNull();
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
        openingHours: {
          monday: "08:00",
          sunday: null,
        },
        closingHours: {
          monday: "20:00",
          sunday: null,
        },
      })
    ).resolves.toEqual(
      expect.objectContaining({
        id: "created-1",
        name: "Creado",
      })
    );

    expect(client.rpc).toHaveBeenCalledWith(
      "create_place",
      expect.objectContaining({
        input_opening_hours: {
          monday: "08:00",
          sunday: null,
        },
        input_closing_hours: {
          monday: "20:00",
          sunday: null,
        },
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
