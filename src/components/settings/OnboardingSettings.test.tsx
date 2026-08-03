import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import OnboardingSettings from "./OnboardingSettings";

const navigate = vi.fn();
const mutateAsync = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/hooks/useSetup", () => ({
  useResetSetup: () => ({ mutateAsync, isPending: false }),
}));

describe("OnboardingSettings", () => {
  it("reinicia o progresso do wizard e abre /setup ao refazer", async () => {
    mutateAsync.mockResolvedValue(undefined);

    render(<OnboardingSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Refazer onboarding" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(navigate).toHaveBeenCalledWith("/setup");
  });
});