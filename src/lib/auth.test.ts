import {
  getCurrentAuthUser,
  normalizeSignInInput,
  normalizeSignUpInput,
  signInWithPassword,
  signOutCurrentUser,
  signUpWithPassword,
  subscribeToAuthChanges,
} from "./auth";
import { getSupabaseClient, requireSupabaseClient } from "./supabase";

jest.mock("./supabase", () => ({
  getSupabaseClient: jest.fn(),
  requireSupabaseClient: jest.fn(),
}));

describe("auth", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("normalizes login input", () => {
    expect(
      normalizeSignInInput({
        email: "  ada@example.com ",
        password: "Abcd123!",
      })
    ).toEqual({
      email: "ada@example.com",
      password: "Abcd123!",
    });

    expect(() =>
      normalizeSignInInput({
        email: "bad-email",
        password: "Abcd123!",
      })
    ).toThrow("Ingresa un correo válido.");

    expect(() =>
      normalizeSignInInput({
        email: "ada@example.com",
        password: "",
      })
    ).toThrow("La contraseña es obligatoria.");

    expect(() =>
      normalizeSignInInput({
        email: "ada@example.com",
        password: undefined as unknown as string,
      })
    ).toThrow("La contraseña es obligatoria.");
  });

  it("normalizes signup input", () => {
    expect(
      normalizeSignUpInput({
        fullName: "  Ada Lovelace ",
        email: " ada@example.com ",
        phone: " +52 449 123 4567 ",
        password: "Abcd123!",
      })
    ).toEqual({
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+52 449 123 4567",
      password: "Abcd123!",
    });

    expect(() =>
      normalizeSignUpInput({
        fullName: "",
        email: "ada@example.com",
        phone: "+52 449 123 4567",
        password: "Abcd123!",
      })
    ).toThrow("El nombre completo es obligatorio.");

    expect(() =>
      normalizeSignUpInput({
        fullName: "Ada",
        email: "bad-email",
        phone: "+52 449 123 4567",
        password: "Abcd123!",
      })
    ).toThrow("Ingresa un correo válido.");

    expect(() =>
      normalizeSignUpInput({
        fullName: "Ada",
        email: "ada@example.com",
        phone: "123",
        password: "Abcd123!",
      })
    ).toThrow("Ingresa un teléfono válido.");

    expect(() =>
      normalizeSignUpInput({
        fullName: "Ada",
        email: "ada@example.com",
        phone: "",
        password: "Abcd123!",
      })
    ).toThrow("Ingresa un teléfono válido.");

    expect(() =>
      normalizeSignUpInput({
        fullName: "Ada",
        email: "ada@example.com",
        phone: "+52 449 123 4567",
        password: "",
      })
    ).toThrow(
      "La contraseña debe tener de 8 a 20 caracteres, una mayúscula, un número y un signo."
    );

    expect(() =>
      normalizeSignUpInput({
        fullName: "Ada",
        email: "ada@example.com",
        phone: "sin digitos",
        password: "Abcd123!",
      })
    ).toThrow("Ingresa un teléfono válido.");

    expect(() =>
      normalizeSignUpInput({
        fullName: "Ada",
        email: "ada@example.com",
        phone: "+52 449 123 4567",
        password: "short",
      })
    ).toThrow(
      "La contraseña debe tener de 8 a 20 caracteres, una mayúscula, un número y un signo."
    );

    expect(() =>
      normalizeSignUpInput({
        fullName: "Ada",
        email: "ada@example.com",
        phone: "+52 449 123 4567",
        password: "abcd123!",
      })
    ).toThrow(
      "La contraseña debe tener de 8 a 20 caracteres, una mayúscula, un número y un signo."
    );

    expect(() =>
      normalizeSignUpInput({
        fullName: "Ada",
        email: "ada@example.com",
        phone: "+52 449 123 4567",
        password: "Abcdefg!",
      })
    ).toThrow(
      "La contraseña debe tener de 8 a 20 caracteres, una mayúscula, un número y un signo."
    );

    expect(() =>
      normalizeSignUpInput({
        fullName: "Ada",
        email: "ada@example.com",
        phone: "+52 449 123 4567",
        password: "Abcd1234",
      })
    ).toThrow(
      "La contraseña debe tener de 8 a 20 caracteres, una mayúscula, un número y un signo."
    );
  });

  it("returns the current user from the current session", async () => {
    (getSupabaseClient as jest.Mock).mockReturnValue({
      auth: {
        getSession: jest.fn().mockResolvedValue({
          data: {
            session: {
              user: {
                id: "user-1",
                email: "ada@example.com",
                user_metadata: {
                  full_name: "Ada Lovelace",
                  phone: "+52 449 123 4567",
                },
              },
            },
          },
          error: null,
        }),
      },
    });

    await expect(getCurrentAuthUser()).resolves.toEqual({
      id: "user-1",
      email: "ada@example.com",
      fullName: "Ada Lovelace",
      phone: "+52 449 123 4567",
      avatarUrl: null,
    });
  });

  it("returns null when there is no configured client or user session", async () => {
    (getSupabaseClient as jest.Mock).mockReturnValue(null);
    await expect(getCurrentAuthUser()).resolves.toBeNull();

    (getSupabaseClient as jest.Mock).mockReturnValue({
      auth: {
        getSession: jest.fn().mockResolvedValue({
          data: { session: null },
          error: null,
        }),
      },
    });

    await expect(getCurrentAuthUser()).resolves.toBeNull();
  });

  it("surfaces session lookup errors", async () => {
    (getSupabaseClient as jest.Mock).mockReturnValue({
      auth: {
        getSession: jest.fn().mockResolvedValue({
          data: { session: null },
          error: { message: "session failed" },
        }),
      },
    });

    await expect(getCurrentAuthUser()).rejects.toThrow("session failed");
  });

  it("subscribes to auth changes and unsubscribes cleanly", () => {
    const unsubscribe = jest.fn();
    let listener: (event: string, session: { user?: object | null } | null) => void =
      () => undefined;

    (getSupabaseClient as jest.Mock).mockReturnValue({
      auth: {
        onAuthStateChange: jest.fn((callback) => {
          listener = callback;
          return {
            data: {
              subscription: {
                unsubscribe,
              },
            },
          };
        }),
      },
    });

    const onUserChange = jest.fn();
    const stop = subscribeToAuthChanges(onUserChange);

    listener("SIGNED_IN", {
      user: {
        id: "user-2",
        email: "grace@example.com",
        phone: null,
        user_metadata: { full_name: "Grace Hopper", phone: "+1 555 0101" },
      },
    });

    listener("SIGNED_OUT", null);

    expect(onUserChange).toHaveBeenNthCalledWith(1, {
      id: "user-2",
      email: "grace@example.com",
      fullName: "Grace Hopper",
      phone: "+1 555 0101",
      avatarUrl: null,
    });
    expect(onUserChange).toHaveBeenNthCalledWith(2, null);
    expect(onUserChange).toHaveBeenCalledTimes(2);

    stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("prefers the direct auth phone when it exists", async () => {
    (requireSupabaseClient as jest.Mock).mockReturnValue({
      auth: {
        signInWithPassword: jest.fn().mockResolvedValue({
          data: {
            user: {
              id: "user-3",
              email: "linus@example.com",
              phone: "+34 600 000 000",
              user_metadata: {
                full_name: "Linus Torvalds",
                phone: "+1 555 9999",
              },
            },
          },
          error: null,
        }),
      },
    });

    await expect(
      signInWithPassword({
        email: "linus@example.com",
        password: "Abcd123!",
      })
    ).resolves.toEqual({
      id: "user-3",
      email: "linus@example.com",
      fullName: "Linus Torvalds",
      phone: "+34 600 000 000",
      avatarUrl: null,
    });
  });

  it("returns a noop auth subscription without a configured client", () => {
    (getSupabaseClient as jest.Mock).mockReturnValue(null);
    expect(() => subscribeToAuthChanges(jest.fn())()).not.toThrow();
  });

  it("signs users in with email and password", async () => {
    const signInWithPasswordMock = jest.fn().mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "ada@example.com",
          user_metadata: { full_name: "Ada Lovelace" },
        },
      },
      error: null,
    });

    (requireSupabaseClient as jest.Mock).mockReturnValue({
      auth: {
        signInWithPassword: signInWithPasswordMock,
      },
    });

    await expect(
      signInWithPassword({
        email: "ada@example.com",
        password: "Abcd123!",
      })
    ).resolves.toEqual({
      id: "user-1",
      email: "ada@example.com",
      fullName: "Ada Lovelace",
      phone: null,
      avatarUrl: null,
    });

    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "Abcd123!",
    });
  });

  it("surfaces login errors and malformed login payloads", async () => {
    (requireSupabaseClient as jest.Mock).mockReturnValue({
      auth: {
        signInWithPassword: jest
          .fn()
          .mockResolvedValueOnce({
            data: { user: null },
            error: { message: "invalid login" },
          })
          .mockResolvedValueOnce({
            data: { user: null },
            error: null,
          }),
      },
    });

    await expect(
      signInWithPassword({
        email: "ada@example.com",
        password: "Abcd123!",
      })
    ).rejects.toThrow("invalid login");

    await expect(
      signInWithPassword({
        email: "ada@example.com",
        password: "Abcd123!",
      })
    ).rejects.toThrow("No se pudo iniciar sesión.");
  });

  it("signs users up and reports whether email confirmation is needed", async () => {
    const signUpMock = jest
      .fn()
      .mockResolvedValueOnce({
        data: {
          user: {
            id: "user-1",
            email: "ada@example.com",
            user_metadata: {
              full_name: "Ada Lovelace",
              phone: "+52 449 123 4567",
            },
          },
          session: { access_token: "token" },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          user: {
            id: "user-2",
            email: "grace@example.com",
            user_metadata: {
              full_name: "Grace Hopper",
              phone: "+1 555 0101",
            },
          },
          session: null,
        },
        error: null,
      });

    (requireSupabaseClient as jest.Mock).mockReturnValue({
      auth: {
        signUp: signUpMock,
      },
    });

    await expect(
      signUpWithPassword({
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        phone: "+52 449 123 4567",
        password: "Abcd123!",
      })
    ).resolves.toEqual({
      user: {
        id: "user-1",
        email: "ada@example.com",
        fullName: "Ada Lovelace",
        phone: "+52 449 123 4567",
        avatarUrl: null,
      },
      needsEmailConfirmation: false,
    });

    await expect(
      signUpWithPassword({
        fullName: "Grace Hopper",
        email: "grace@example.com",
        phone: "+1 555 0101",
        password: "Abcd123!",
      })
    ).resolves.toEqual({
      user: {
        id: "user-2",
        email: "grace@example.com",
        fullName: "Grace Hopper",
        phone: "+1 555 0101",
        avatarUrl: null,
      },
      needsEmailConfirmation: true,
    });

    expect(signUpMock).toHaveBeenNthCalledWith(1, {
      email: "ada@example.com",
      password: "Abcd123!",
      options: {
        data: {
          full_name: "Ada Lovelace",
          phone: "+52 449 123 4567",
        },
      },
    });
  });

  it("surfaces signup errors and malformed signup payloads", async () => {
    (requireSupabaseClient as jest.Mock).mockReturnValue({
      auth: {
        signUp: jest
          .fn()
          .mockResolvedValueOnce({
            data: { user: null, session: null },
            error: { message: "signup failed" },
          })
          .mockResolvedValueOnce({
            data: { user: null, session: null },
            error: null,
          }),
      },
    });

    await expect(
      signUpWithPassword({
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        phone: "+52 449 123 4567",
        password: "Abcd123!",
      })
    ).rejects.toThrow("signup failed");

    await expect(
      signUpWithPassword({
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        phone: "+52 449 123 4567",
        password: "Abcd123!",
      })
    ).rejects.toThrow("No se pudo crear la cuenta.");
  });

  it("signs users out", async () => {
    const signOut = jest
      .fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: "signout failed" } });

    (requireSupabaseClient as jest.Mock).mockReturnValue({
      auth: {
        signOut,
      },
    });

    await expect(signOutCurrentUser()).resolves.toBeUndefined();
    await expect(signOutCurrentUser()).rejects.toThrow("signout failed");
  });
});
