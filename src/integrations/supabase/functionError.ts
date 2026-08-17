import { FunctionsHttpError, FunctionsFetchError, FunctionsRelayError } from "@supabase/supabase-js";

export const MSG_SESSAO_EXPIRADA =
  "Sua sessão expirou. Recarregue a página e entre de novo para continuar — nada do que você preencheu foi perdido.";

/**
 * Extrai a mensagem real de uma falha de edge function.
 *
 * POR QUE ISSO EXISTE: `supabase.functions.invoke` não entrega o corpo da
 * resposta quando o status não é 2xx. Ele devolve `data: null` e um
 * `FunctionsHttpError` cuja `message` é sempre a mesma string genérica —
 * "Edge Function returned a non-2xx status code". O corpo fica em
 * `error.context`, que é a Response crua e precisa ser lida à mão.
 *
 * O efeito era que toda mensagem escrita com cuidado no backend morria no
 * caminho. As functions de IA respondem coisas acionáveis ("os créditos de IA
 * do projeto acabaram", "a IA está recebendo muitas requisições agora"), e o
 * usuário via a string genérica em inglês. O padrão `if (data?.error) throw`
 * espalhado pelos hooks nunca rodava nesses casos, porque em non-2xx `data` é
 * null.
 *
 * A Response só pode ser lida uma vez, então esta função consome o corpo. Quem
 * chamar não deve tocar em `error.context` depois.
 */
export async function erroDeFunction(error: unknown, padrao: string): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    const resp = error.context as Response | undefined;
    const corpo = typeof resp?.json === "function"
      ? await resp.json().catch(() => null)
      : null;

    const status = resp?.status;

    // 401 das functions significa uma coisa só: o token da aba não vale mais.
    // A mensagem crua ("Não autorizado") descreve a resposta HTTP, não o que
    // aconteceu com o usuário — quem estava com a tela aberta há horas lia isso
    // como "você não tem permissão" e não como "entre de novo". Aconteceu no
    // wizard de canal: a criação da instância Evolution falhou com "Não
    // autorizado" só porque a sessão daquela aba tinha expirado.
    if (status === 401) return new Error(MSG_SESSAO_EXPIRADA);

    const real = corpo?.error ?? corpo?.message;
    if (typeof real === "string" && real.trim()) return new Error(real.trim());

    // Sem corpo legível o status ainda diz mais que a mensagem genérica.
    return new Error(status ? `${padrao} (HTTP ${status})` : padrao);
  }

  if (error instanceof FunctionsFetchError) {
    return new Error("Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.");
  }

  if (error instanceof FunctionsRelayError) {
    return new Error(`${padrao} O servidor não conseguiu executar a função.`);
  }

  // Erro fora do contrato do client (message própria, se houver, é melhor que o padrão).
  const message = error instanceof Error ? error.message.trim() : "";
  return new Error(message || padrao);
}
