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

  it("exposes a null client when the environment is incomplete", () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    const createClient = jest.fn();
    jest.doMock("@supabase/supabase-js", () => ({
      createClient,
    }));

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const module = require("./supabase");

      expect(module.isSupabaseConfigured).toBe(false);
      expect(module.getSupabaseClient()).toBeNull();
      expect(module.supabase).toBeNull();
      expect(() => module.requireSupabaseClient()).toThrow(
        "Supabase no esta configurado. Configura EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY."
      );
      expect(createClient).not.toHaveBeenCalled();
    });
  });

  it("creates and exposes the configured supabase client", () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://parkpulse.supabase.co";
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    const mockClient = { kind: "supabase-client" };
    const createClient = jest.fn(() => mockClient);
    jest.doMock("@supabase/supabase-js", () => ({
      createClient,
    }));

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const module = require("./supabase");

      expect(module.isSupabaseConfigured).toBe(true);
      expect(createClient).toHaveBeenCalledWith(
        "https://parkpulse.supabase.co",
        "anon-key",
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        }
      );
      expect(module.supabase).toBe(mockClient);
      expect(module.getSupabaseClient()).toBe(mockClient);
      expect(module.requireSupabaseClient()).toBe(mockClient);
    });
  });
});
