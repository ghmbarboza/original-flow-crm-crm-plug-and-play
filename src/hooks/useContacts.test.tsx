import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useContacts } from "./useContacts";

const ORG_ID = "org-1";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ profile: { org_id: ORG_ID } }),
}));

/**
 * Canal fake com a mesma regra do supabase-js: registrar `postgres_changes`
 * depois do `subscribe()` lança. Canais são indexados pelo tópico, como no
 * cliente real — é isso que fazia dois consumidores do hook colidirem.
 */
const channels = new Map<string, { subscribed: boolean }>();
const topics: string[] = [];

function channel(topic: string) {
  topics.push(topic);
  const existing = channels.get(topic);
  const state = existing ?? { subscribed: false };
  channels.set(topic, state);

  const api = {
    on: () => {
      if (state.subscribed) {
        throw new Error(`cannot add \`postgres_changes\` callbacks for ${topic} after \`subscribe()\`.`);
      }
      return api;
    },
    subscribe: () => {
      state.subscribed = true;
      return api;
    },
  };
  return api;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: (topic: string) => channel(topic),
    removeChannel: vi.fn(),
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
  },
}));

function Consumer() {
  const { isLoading } = useContacts();
  return <div>{isLoading ? "carregando" : "pronto"}</div>;
}

function renderWithClient(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("useContacts realtime", () => {
  beforeEach(() => {
    channels.clear();
    topics.length = 0;
  });

  it("dá um canal próprio a cada consumidor, para dois montados juntos não colidirem", async () => {
    // A lista e o painel de Grupos usam o hook ao mesmo tempo. Com um tópico fixo,
    // o segundo registrava `postgres_changes` no canal já inscrito pelo primeiro e quebrava.
    const { getAllByText } = renderWithClient(
      <>
        <Consumer />
        <Consumer />
      </>,
    );

    await waitFor(() => expect(getAllByText("pronto")).toHaveLength(2));

    expect(topics).toHaveLength(2);
    expect(new Set(topics).size).toBe(2);
    for (const topic of topics) {
      expect(topic).toContain(`contacts:${ORG_ID}`);
    }
  });
});
