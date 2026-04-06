import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import AuthScreen from "./AuthScreen";
import { signInWithPassword, signUpWithPassword } from "../lib/auth";

jest.mock("../lib/auth", () => ({
  signInWithPassword: jest.fn(),
  signUpWithPassword: jest.fn(),
}));

jest.mock("../lib/supabase", () => ({
  isSupabaseConfigured: true,
}));

describe("AuthScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("submits login credentials", async () => {
    (signInWithPassword as jest.Mock).mockResolvedValue({
      id: "user-1",
      email: "ada@example.com",
      fullName: "Ada Lovelace",
      phone: null,
    });

    const screen = render(<AuthScreen />);

    fireEvent.changeText(screen.getByTestId("auth-email-input"), "ada@example.com");
    fireEvent.changeText(screen.getByTestId("auth-password-input"), "Abcd123!");
    fireEvent.press(screen.getByTestId("auth-submit-button"));

    await waitFor(() => {
      expect(signInWithPassword).toHaveBeenCalledWith({
        email: "ada@example.com",
        password: "Abcd123!",
      });
    });
  });

  it("submits signup credentials and switches to login when confirmation is required", async () => {
    (signUpWithPassword as jest.Mock).mockResolvedValue({
      user: {
        id: "user-1",
        email: "ada@example.com",
        fullName: "Ada Lovelace",
        phone: "+52 449 123 4567",
      },
      needsEmailConfirmation: true,
    });

    const screen = render(<AuthScreen />);

    fireEvent.press(screen.getByTestId("auth-mode-signup"));
    fireEvent.changeText(screen.getByTestId("auth-full-name-input"), "Ada Lovelace");
    fireEvent.changeText(screen.getByTestId("auth-email-input"), "ada@example.com");
    fireEvent.changeText(screen.getByTestId("auth-phone-input"), "+52 449 123 4567");
    fireEvent.changeText(screen.getByTestId("auth-password-input"), "Abcd123!");
    fireEvent.press(screen.getByTestId("auth-submit-button"));

    await waitFor(() => {
      expect(signUpWithPassword).toHaveBeenCalledWith({
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        phone: "+52 449 123 4567",
        password: "Abcd123!",
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("auth-feedback")).toBeTruthy();
      expect(
        screen.getByText(
          "Tu cuenta fue creada. Revisa tu correo para confirmar y luego inicia sesion."
        )
      ).toBeTruthy();
    });
  });

  it("shows authentication errors", async () => {
    (signInWithPassword as jest.Mock).mockRejectedValue(new Error("Credenciales invalidas"));

    const screen = render(<AuthScreen />);

    fireEvent.changeText(screen.getByTestId("auth-email-input"), "ada@example.com");
    fireEvent.changeText(screen.getByTestId("auth-password-input"), "wrong-pass");
    fireEvent.press(screen.getByTestId("auth-submit-button"));

    await waitFor(() => {
      expect(screen.getByText("Credenciales invalidas")).toBeTruthy();
    });
  });
});
