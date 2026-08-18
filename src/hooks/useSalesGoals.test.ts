import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { ASSIGN_INDIVIDUAL, ASSIGN_TEAM } from "./useSalesGoals";

/**
 * O defeito real: a tela enviava "user" e o banco só aceita
 * ('individual','team'). Toda meta individual morria no CHECK, e o usuário via
 * apenas "não foi possível criar a meta".
 */
describe("assign_type de metas", () => {
  const migration = fs.readFileSync(
    "supabase/migrations/20260714100002_email_analytics.sql",
    "utf8",
  );
  const check = /assign_type TEXT NOT NULL DEFAULT '\w+' CHECK \(assign_type IN \(([^)]*)\)\)/.exec(migration);

  it("a migration continua sendo a fonte do vocabulário", () => {
    expect(check, "CHECK de assign_type não encontrado na migration").toBeTruthy();
  });

  it("os valores usados no código são aceitos pelo banco", () => {
    const aceitos = (check![1].match(/'([^']+)'/g) ?? []).map((v) => v.replaceAll("'", ""));
    expect(aceitos).toContain(ASSIGN_INDIVIDUAL);
    expect(aceitos).toContain(ASSIGN_TEAM);
  });

  it("não voltamos a chamar o individual de 'user'", () => {
    expect(ASSIGN_INDIVIDUAL).not.toBe("user");
  });
});
