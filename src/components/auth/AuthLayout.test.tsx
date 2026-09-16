import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthLayout } from "./AuthLayout";

const primeiroAcesso = vi.hoisted(() => ({ valor: false }));

vi.mock("@/hooks/usePrimeiroAcesso", () => ({
  usePrimeiroAcesso: () => ({ primeiroAcesso: primeiroAcesso.valor, carregando: false }),
}));
vi.mock("./LoginForm", () => ({ LoginForm: () => <div>form de login</div> }));
vi.mock("./SignupForm", () => ({
  SignupForm: ({ primeiroAcesso: p }: { primeiroAcesso?: boolean }) => (
    <div>{p ? "Configuração inicial" : "Criar conta"}</div>
  ),
}));

describe("tela de /auth", () => {
  it("instância nova abre em configuração inicial", () => {
    primeiroAcesso.valor = true;
    render(<AuthLayout />);

    expect(screen.getByTestId("auth-primeiro-acesso")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Primeiro acesso" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar administrador" })).toBeInTheDocument();
    expect(screen.getByText("Configuração inicial")).toBeInTheDocument();
    // O painel de cadastro entra na frente (classe active na casca animada).
    expect(document.querySelector(".auth-wrap")?.className).toContain("active");
  });

  it("instância com gente continua no login de sempre", () => {
    primeiroAcesso.valor = false;
    render(<AuthLayout />);

    expect(screen.getByTestId("auth-login")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Entrar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar conta" })).toBeInTheDocument();
    expect(document.querySelector(".auth-wrap")?.className).not.toContain("active");
  });
});
