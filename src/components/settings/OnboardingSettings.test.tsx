import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import OnboardingSettings from "./OnboardingSettings";

const navigate = vi.fn();
const resetOnboarding = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn() },
}));

vi.mock("@/hooks/useOnboarding", () => ({
  useOnboarding: () => ({ resetOnboarding }),
}));

describe("OnboardingSettings", () => {
  it("reinicia o progresso e abre /onboarding ao refazer", async () => {
    resetOnboarding.mockResolvedValue(undefined);

    render(<OnboardingSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Refazer onboarding" }));

    await waitFor(() => expect(resetOnboarding).toHaveBeenCalledTimes(1));
    expect(navigate).toHaveBeenCalledWith("/onboarding");
  });
});