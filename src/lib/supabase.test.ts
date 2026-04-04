describe("supabase", () => {
  const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const originalAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    if (originalUrl === undefined) {
      delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    } else {
      process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl;
    }

    if (originalAnonKey === undefined) {
      delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
    }
  });

  function loadModule(options?: {
    asyncStorage?: unknown;
    configured?: boolean;
  }) {
    if (options?.configured) {
      process.env.EXPO_PUBLIC_SUPABASE_URL = "https://parkpulse.supabase.co";
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    } else {
      delete process.env.EXPO_PUBLIC_SUPABASE_URL;
      delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    }

    const createClient = jest.fn(() => ({ kind: "supabase-client" }));
    jest.doMock("@supabase/supabase-js", () => ({
      createClient,
    }));

    if (options && "asyncStorage" in options) {
      jest.doMock("@react-native-async-storage/async-storage", () => ({
        __esModule: true,
        default: options.asyncStorage,
      }));
    }

    let module: typeof import("./supabase");
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      module = require("./supabase");
    });

    return {
      module: module!,
      createClient,
    };
  }

  it("exposes a null client when the environment is incomplete", () => {
    const { module, createClient } = loadModule({ configured: false });

    expect(module.isSupabaseConfigured).toBe(false);
    expect(module.getSupabaseClient()).toBeNull();
    expect(module.supabase).toBeNull();
    expect(() => module.requireSupabaseClient()).toThrow(
      "Supabase no esta configurado. Configura EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY."
    );
    expect(createClient).not.toHaveBeenCalled();
  });

  it("creates and exposes the configured supabase client", () => {
    const asyncStorage = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    };
    const { module, createClient } = loadModule({
      configured: true,
      asyncStorage,
    });

    expect(module.isSupabaseConfigured).toBe(true);
    expect(createClient).toHaveBeenCalledWith(
      "https://parkpulse.supabase.co",
      "anon-key",
      {
        auth: {
          storage: module.sessionStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      }
    );
    expect(module.supabase).toEqual({ kind: "supabase-client" });
    expect(module.getSupabaseClient()).toEqual({ kind: "supabase-client" });
    expect(module.requireSupabaseClient()).toEqual({ kind: "supabase-client" });
  });

  it("detects native storage availability errors", () => {
    const { module } = loadModule({ configured: false });

    expect(
      module.isNativeStorageUnavailableError(
        new Error("Native module is null, cannot access legacy storage")
      )
    ).toBe(true);
    expect(module.isNativeStorageUnavailableError("cannot access legacy storage")).toBe(
      true
    );
    expect(module.isNativeStorageUnavailableError(undefined)).toBe(false);
    expect(module.isNativeStorageUnavailableError(new Error("permission denied"))).toBe(
      false
    );
  });

  it("creates a working in-memory storage", async () => {
    const { module } = loadModule({ configured: false });
    const storage = module.createMemoryStorage();

    await expect(storage.getItem("token")).resolves.toBeNull();
    await expect(storage.setItem("token", "123")).resolves.toBeUndefined();
    await expect(storage.getItem("token")).resolves.toBe("123");
    await expect(storage.removeItem("token")).resolves.toBeUndefined();
    await expect(storage.getItem("token")).resolves.toBeNull();
  });

  it("falls back to memory storage when the native storage shape is invalid", async () => {
    const { module } = loadModule({ configured: false });
    const storage = module.createSessionStorage(null);

    await storage.setItem("session", "abc");
    await expect(storage.getItem("session")).resolves.toBe("abc");
    await storage.removeItem("session");
    await expect(storage.getItem("session")).resolves.toBeNull();
  });

  it("falls back to memory storage when native storage throws availability errors", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const nativeStorage = {
      getItem: jest
        .fn()
        .mockRejectedValueOnce(
          new Error("Native module is null, cannot access legacy storage")
        )
        .mockResolvedValue(null),
      setItem: jest
        .fn()
        .mockRejectedValueOnce(
          new Error("Native module is null, cannot access legacy storage")
        )
        .mockResolvedValue(undefined),
      removeItem: jest
        .fn()
        .mockRejectedValueOnce(
          new Error("Native module is null, cannot access legacy storage")
        )
        .mockResolvedValue(undefined),
    };

    const { module } = loadModule({ configured: false });
    const storage = module.createSessionStorage(nativeStorage);

    await expect(storage.setItem("session", "abc")).resolves.toBeUndefined();
    await expect(storage.getItem("session")).resolves.toBe("abc");
    await expect(storage.removeItem("session")).resolves.toBeUndefined();
    await expect(storage.getItem("session")).resolves.toBeNull();

    await expect(storage.setItem("session", "native")).resolves.toBeUndefined();
    await expect(storage.getItem("session")).resolves.toBeNull();
    await expect(storage.removeItem("session")).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("rethrows non-native storage errors", async () => {
    const nativeStorage = {
      getItem: jest.fn().mockRejectedValue(new Error("permission denied")),
      setItem: jest.fn().mockRejectedValue(new Error("permission denied")),
      removeItem: jest.fn().mockRejectedValue(new Error("permission denied")),
    };

    const { module } = loadModule({ configured: false });
    const storage = module.createSessionStorage(nativeStorage);

    await expect(storage.getItem("token")).rejects.toThrow("permission denied");
    await expect(storage.setItem("token", "123")).rejects.toThrow(
      "permission denied"
    );
    await expect(storage.removeItem("token")).rejects.toThrow("permission denied");
  });
});
