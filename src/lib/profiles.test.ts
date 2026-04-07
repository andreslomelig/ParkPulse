import {
  fetchCurrentUserProfile,
  upsertCurrentUserProfile,
} from "./profiles";
import {
  getSupabaseClient,
  requireSupabaseClient,
} from "./supabase";

jest.mock("./supabase", () => ({
  getSupabaseClient: jest.fn(),
  requireSupabaseClient: jest.fn(),
}));

describe("profiles", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns null when supabase or the current user is unavailable", async () => {
    (getSupabaseClient as jest.Mock).mockReturnValue(null);
    await expect(fetchCurrentUserProfile()).resolves.toBeNull();

    (getSupabaseClient as jest.Mock).mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    });
    await expect(fetchCurrentUserProfile()).resolves.toBeNull();
  });

  it("fetches the current user profile and surfaces auth/query errors", async () => {
    const authErrorClient = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "auth failed" },
        }),
      },
    };
    const successClient = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                user_id: "user-1",
                email: "demo@parkpulse.app",
                full_name: "Demo User",
              },
              error: null,
            }),
          })),
        })),
      })),
    };
    const queryErrorClient = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue({
              data: null,
              error: { message: "query failed" },
            }),
          })),
        })),
      })),
    };

    (getSupabaseClient as jest.Mock).mockReturnValue(authErrorClient);
    await expect(fetchCurrentUserProfile()).rejects.toThrow("auth failed");

    (getSupabaseClient as jest.Mock).mockReturnValue(successClient);
    await expect(fetchCurrentUserProfile()).resolves.toEqual({
      userId: "user-1",
      email: "demo@parkpulse.app",
      phone: null,
      fullName: "Demo User",
      preferredName: null,
      avatarUrl: null,
      source: "remote",
    });

    (getSupabaseClient as jest.Mock).mockReturnValue(queryErrorClient);
    await expect(fetchCurrentUserProfile()).rejects.toThrow("query failed");
  });

  it("returns null when the fetched profile row is incomplete", async () => {
    const client = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn().mockResolvedValue({
              data: { user_id: "user-1" },
              error: null,
            }),
          })),
        })),
      })),
    };

    (getSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(fetchCurrentUserProfile()).resolves.toBeNull();
  });

  it("returns null when the fetched profile row is empty", async () => {
    const client = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
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

    await expect(fetchCurrentUserProfile()).resolves.toBeNull();
  });

  it("updates the current user profile using the authenticated email by default", async () => {
    const client = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: {
            user: {
              id: "user-1",
              email: "auth@parkpulse.app",
            },
          },
          error: null,
        }),
      },
      from: jest.fn(() => ({
        upsert: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({
              data: {
                user_id: "user-1",
                email: "auth@parkpulse.app",
                phone: "4491234567",
                full_name: "Usuario Demo",
                preferred_name: "Demo",
                avatar_url: "https://example.com/avatar.png",
              },
              error: null,
            }),
          })),
        })),
      })),
    };

    (requireSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(
      upsertCurrentUserProfile({
        phone: "4491234567",
        fullName: "Usuario Demo",
        preferredName: "Demo",
        avatarUrl: "https://example.com/avatar.png",
      })
    ).resolves.toEqual({
      userId: "user-1",
      email: "auth@parkpulse.app",
      phone: "4491234567",
      fullName: "Usuario Demo",
      preferredName: "Demo",
      avatarUrl: "https://example.com/avatar.png",
      source: "remote",
    });
  });

  it("allows overriding the authenticated email with a normalized input value", async () => {
    const client = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: {
            user: {
              id: "user-1",
              email: "auth@parkpulse.app",
            },
          },
          error: null,
        }),
      },
      from: jest.fn(() => ({
        upsert: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({
              data: {
                user_id: "user-1",
                email: "override@parkpulse.app",
              },
              error: null,
            }),
          })),
        })),
      })),
    };

    (requireSupabaseClient as jest.Mock).mockReturnValue(client);

    await expect(
      upsertCurrentUserProfile({
        email: "  override@parkpulse.app  ",
      })
    ).resolves.toEqual({
      userId: "user-1",
      email: "override@parkpulse.app",
      phone: null,
      fullName: null,
      preferredName: null,
      avatarUrl: null,
      source: "remote",
    });
  });

  it("surfaces authentication and parsing errors when updating the profile", async () => {
    const noUserClient = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    };
    const authErrorClient = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "auth update failed" },
        }),
      },
    };
    const noEmailClient = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "user-1", email: null } },
          error: null,
        }),
      },
    };
    const queryErrorClient = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "user-1", email: "a@b.com" } },
          error: null,
        }),
      },
      from: jest.fn(() => ({
        upsert: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: "update failed" },
            }),
          })),
        })),
      })),
    };
    const malformedClient = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "user-1", email: "a@b.com" } },
          error: null,
        }),
      },
      from: jest.fn(() => ({
        upsert: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({
              data: { user_id: "user-1" },
              error: null,
            }),
          })),
        })),
      })),
    };

    (requireSupabaseClient as jest.Mock).mockReturnValue(noUserClient);
    await expect(upsertCurrentUserProfile({})).rejects.toThrow(
      "Debes iniciar sesión para actualizar tu perfil."
    );

    (requireSupabaseClient as jest.Mock).mockReturnValue(authErrorClient);
    await expect(upsertCurrentUserProfile({})).rejects.toThrow(
      "auth update failed"
    );

    (requireSupabaseClient as jest.Mock).mockReturnValue(noEmailClient);
    await expect(upsertCurrentUserProfile({})).rejects.toThrow(
      "El correo del perfil es obligatorio."
    );

    (requireSupabaseClient as jest.Mock).mockReturnValue(queryErrorClient);
    await expect(upsertCurrentUserProfile({})).rejects.toThrow("update failed");

    (requireSupabaseClient as jest.Mock).mockReturnValue(malformedClient);
    await expect(upsertCurrentUserProfile({})).rejects.toThrow(
      "No se pudo interpretar el perfil actualizado."
    );

    (requireSupabaseClient as jest.Mock).mockReturnValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "user-1", email: "a@b.com" } },
          error: null,
        }),
      },
      from: jest.fn(() => ({
        upsert: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          })),
        })),
      })),
    });
    await expect(upsertCurrentUserProfile({})).rejects.toThrow(
      "No se pudo interpretar el perfil actualizado."
    );
  });
});
