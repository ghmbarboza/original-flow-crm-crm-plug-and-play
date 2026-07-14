import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DashboardPage from "./DashboardPage";

vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    profile: { full_name: "Ana" },
    role: "admin",
  }),
}));

vi.mock("@/hooks/useOnboarding", () => ({
  useOnboarding: () => {
    throw new Error("Dashboard must not depend on onboarding state");
  },
}));

describe("DashboardPage", () => {
  it("permite acessar o dashboard sem consultar ou bloquear por onboarding", () => {
    render(<DashboardPage />);

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByText(/Bem-vindo, Ana!/)).toBeInTheDocument();
  });
});