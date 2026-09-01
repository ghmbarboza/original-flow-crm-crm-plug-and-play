import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./client";

/**
 * Renova a sessão e repete a chamada quando uma edge function responde 401.
 *
 * POR QUE ISSO EXISTE: o token de acesso vive ~1h e o refresh automático roda
 * num timer que o navegador congela quando a máquina dorme ou a aba fica muito
 * tempo em segundo plano. Quem voltava para uma aba antiga e clicava em salvar
 * levava um 401 traduzido para "Sua sessão expirou. Recarregue a página" — em
 * pleno preenchimento de formulário (aconteceu no cadastro das credenciais do
 * Gmail em 31/08). A sessão quase sempre é recuperável sem recarregar nada:
 * basta renovar com o refresh token e repetir a chamada. A mensagem de sessão
 * expirada continua existindo, mas agora só aparece quando a renovação falha de
 * verdade (refresh token morto), que é quando entrar de novo é inevitável.
 *
 * ONDE INTERCEPTA: `supabase.functions` é um getter que cria um FunctionsClient
 * NOVO a cada acesso (supabase-js v2), então não adianta trocar o `invoke` de
 * uma instância. Sombrear o getter na NOSSA instância do client cobre os 31
 * pontos que chamam functions.invoke hoje e qualquer um futuro, sem tocar no
 * client.ts (gerado pelo Lovable, seria sobrescrito no próximo sync).
 *
 * O token da repetição já sai renovado porque o fetch interno do supabase-js
 * resolve o access token a cada requisição (fetchWithAuth chama getAccessToken
 * por chamada), não na criação do client.
 */

type Cliente = typeof supabase;
type Functions = Cliente["functions"];
type Invoke = Functions["invoke"];

function respondeu401(erro: unknown): boolean {
  if (!(erro instanceof FunctionsHttpError)) return false;
  // Só olha o status: o corpo da Response fica intacto para o erroDeFunction.
  const resposta = erro.context as { status?: number } | undefined;
  return resposta?.status === 401;
}

export function instalarRenovacaoDeSessaoNasFunctions(cliente: Cliente = supabase): void {
  let prototipo: object | null = Object.getPrototypeOf(cliente);
  let descritor: PropertyDescriptor | undefined;
  while (prototipo && !descritor?.get) {
    descritor = Object.getOwnPropertyDescriptor(prototipo, "functions");
    if (!descritor?.get) prototipo = Object.getPrototypeOf(prototipo);
  }
  const getterOriginal = descritor?.get;
  // Se a estrutura interna do supabase-js mudar, ficar sem interceptação é só
  // o comportamento antigo; quebrar o boot do app seria pior.
  if (!getterOriginal) return;

  Object.defineProperty(cliente, "functions", {
    configurable: true,
    get(): Functions {
      const functions = getterOriginal.call(cliente) as Functions;
      const invokeOriginal = functions.invoke.bind(functions) as Invoke;

      const invokeComRenovacao = (async (nome, opcoes) => {
        const primeira = await invokeOriginal(nome, opcoes);
        if (!respondeu401(primeira.error)) return primeira;

        const renovada = await cliente.auth.refreshSession();
        if (renovada.error || !renovada.data.session) return primeira;

        return invokeOriginal(nome, opcoes);
      }) as Invoke;

      functions.invoke = invokeComRenovacao;
      return functions;
    },
  });
}
