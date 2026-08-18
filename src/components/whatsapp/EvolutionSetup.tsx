import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, Loader2, PlusCircle, QrCode, RefreshCw, ServerCog, Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizarServerUrl } from "@/lib/evolutionUrl";
import { ApiKeyTutorialDialog } from "@/components/settings/ApiKeyTutorialDialog";
import {
  useConnectEvolution, useEvolutionInstances, useEvolutionStatus, useSyncEvolutionStatus,
  type EvolutionServerInstance,
} from "@/hooks/useWhatsAppConfig";

interface Props {
  onConnected: () => void;
  onBack: () => void;
}

type Modo = "create" | "existing";

const ESTADO_LABEL: Record<string, string> = {
  open: "Conectada",
  connecting: "Aguardando pareamento",
  close: "Desconectada",
};


/**
 * Passo 2a do wizard: credenciais Evolution, escolha da instância (nova ou
 * existente) e QR Code.
 *
 * Depois de conectar, mostra o QR e faz poll do status da instância até o número
 * parear (o webhook da Evolution atualiza `status` para "connected").
 */
export function EvolutionSetup({ onConnected, onBack }: Props) {
  const connect = useConnectEvolution();
  const listar = useEvolutionInstances();
  const sincronizar = useSyncEvolutionStatus();
  const [form, setForm] = useState({
    server_url: "",
    api_key: "",
    instance_name: "",
    display_name: "",
  });
  const [modo, setModo] = useState<Modo | null>(null);
  const [servidorOk, setServidorOk] = useState(false);
  const [erroServidor, setErroServidor] = useState<string | null>(null);
  const [instancias, setInstancias] = useState<EvolutionServerInstance[] | null>(null);
  const [selecionada, setSelecionada] = useState<EvolutionServerInstance | null>(null);
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const { data: status } = useEvolutionStatus(instanceId, !!instanceId);
  const connected = status?.status === "connected";

  /**
   * O QR Code do WhatsApp vale poucos segundos. A Evolution gera um novo em
   * seguida e avisa por `QRCODE_UPDATED`, que o webhook grava em
   * `evolution_configs.qr_code` — e o poll de 4s já traz esse campo.
   *
   * A tela mostrava só o QR capturado na criação da instância. Quem ia pegar o
   * celular voltava para um código morto, escaneava, nada acontecia, e depois de
   * algumas tentativas a Evolution fechava o socket. Preferir sempre o do banco
   * faz o código na tela se renovar sozinho.
   */
  const qrAtual = status?.qr_code ?? qrCode;

  // `disconnected` aqui significa que a Evolution desistiu de parear e fechou o
  // socket. Continuar exibindo o QR seria mentir: ele não vale mais.
  const sessaoExpirada = !connected && status?.status === "disconnected";

  /**
   * Enquanto o pareamento não fecha, o CRM também PERGUNTA ao servidor, a cada
   * 10s, em vez de só esperar o webhook.
   *
   * Um `CONNECTION_UPDATE` perdido deixava a tela presa no QR com o número já
   * conectado do outro lado — sem nada que o usuário pudesse fazer. O poll do
   * banco (4s) continua sendo o caminho normal e rápido; isto é a rede de
   * segurança, e por isso o intervalo é bem maior.
   */
  useEffect(() => {
    if (!instanceId || connected) return;
    const id = setInterval(() => {
      sincronizar.mutate(instanceId);
    }, 10_000);
    return () => clearInterval(id);
    // `sincronizar` vem de useMutation e é estável entre renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId, connected]);

  const credenciaisOk = !!form.server_url.trim() && !!form.api_key.trim();

  const escolherModo = async (valor: Modo) => {
    if (!credenciaisOk) {
      toast.error("Informe a URL do servidor e a API key primeiro.");
      return;
    }
    setModo(valor);
    // Se o teste de conexão já trouxe a lista, não busca de novo.
    if (valor === "existing" && instancias === null) await carregarInstancias();
  };

  const carregarInstancias = async () => {
    setErroServidor(null);
    try {
      const lista = await listar.mutateAsync({
        server_url: normalizarServerUrl(form.server_url),
        api_key: form.api_key.trim(),
      });
      setInstancias(lista);
      if (lista.length === 0) toast.info("Nenhuma instância encontrada nesse servidor.");
      return lista;
    } catch (error) {
      // NÃO marcar como lista vazia: a consulta falhou, e "0 instâncias" seria
      // uma afirmação sobre o servidor que ninguém verificou. O usuário lia
      // "0 instância(s) neste servidor" achando que o servidor estava vazio,
      // quando na verdade a chave tinha sido recusada.
      setInstancias(null);
      const msg = error instanceof Error ? error.message : "Falha ao listar instâncias.";
      setErroServidor(msg);
      toast.error(msg);
      return null;
    }
  };

  /**
   * Testa as credenciais antes de qualquer criação de instância.
   *
   * A listagem é o teste: se ela responde, a URL e a API key estão certas — e o
   * usuário já vê o que existe no servidor, em vez de descobrir só depois de
   * escolher "usar instância existente".
   */
  const testarConexao = async () => {
    if (!credenciaisOk) {
      toast.error("Informe a URL do servidor e a API key primeiro.");
      return;
    }
    setForm((f) => ({ ...f, server_url: normalizarServerUrl(f.server_url) }));
    const lista = await carregarInstancias();
    if (!lista) {
      setServidorOk(false);
      return;
    }
    setServidorOk(true);
    toast.success(
      lista.length === 0
        ? "Servidor respondeu. Nenhuma instância criada ainda."
        : `Servidor respondeu: ${lista.length} instância(s) encontrada(s).`,
    );
  };

  const conectar = async (nome: string, modoEnvio: Modo) => {
    setAviso(null);
    try {
      const result = await connect.mutateAsync({
        server_url: normalizarServerUrl(form.server_url),
        api_key: form.api_key.trim(),
        instance_name: nome,
        display_name: form.display_name.trim() || nome,
        mode: modoEnvio,
      });
      setInstanceId(result.instance_id);
      setQrCode(result.qr_code);
      setAviso(result.warning ?? null);
      if (result.status === "connected") {
        toast.success("Instância já conectada.");
      } else if (result.warning) {
        toast.error("Webhook registrado, mas o servidor não gerou o QR Code.");
      } else {
        toast.success("Instância pronta. Escaneie o QR Code no WhatsApp.");
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível conectar à Evolution.",
      );
    }
  };

  const criarNova = () => {
    if (!form.instance_name.trim()) {
      toast.error("Informe o nome da nova instância.");
      return;
    }
    void conectar(form.instance_name.trim(), "create");
  };

  const tentarDeNovo = () => {
    const nome = modo === "existing" ? selecionada?.instance_name : form.instance_name.trim();
    if (!nome) return;
    setQrCode(null);
    void conectar(nome, modo === "existing" ? "existing" : "create");
  };

  const showQr = qrAtual && !connected && !sessaoExpirada;
  const travado = connect.isPending;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="server_url">URL do servidor Evolution</Label>
          <Input
            id="server_url"
            placeholder="https://evolution.suaempresa.com"
            value={form.server_url}
            onChange={(e) => setForm({ ...form, server_url: e.target.value })}
            onBlur={() => setForm((f) => ({ ...f, server_url: normalizarServerUrl(f.server_url) }))}
            disabled={!!instanceId}
            aria-describedby="server_url_ajuda"
          />
          <p id="server_url_ajuda" className="text-xs" style={{ color: "var(--via-text-muted)" }}>
            * Se o seu link termina em <code>/manager</code>, remova essa parte — aqui vai só o
            endereço do servidor (ex.: <code>https://evolution.suaempresa.com</code>).
          </p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="api_key">API Key</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="api_key"
              type="password"
              className="min-w-0 flex-1"
              value={form.api_key}
              onChange={(e) => setForm({ ...form, api_key: e.target.value })}
              disabled={!!instanceId}
            />
            <Button
              type="button"
              variant="outline"
              onClick={testarConexao}
              disabled={!credenciaisOk || listar.isPending || !!instanceId}
              data-testid="evolution-test"
            >
              {listar.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.5} />
                  Testando…
                </>
              ) : (
                "Testar conexão"
              )}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ApiKeyTutorialDialog service="evolution" />
            <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
              A chave é a global do servidor, a mesma que abre o Manager.
            </p>
          </div>
          {servidorOk && !instanceId && instancias && (
            <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--via-success)" }}>
              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              Servidor conectado · {instancias.length} instância(s) neste servidor
            </p>
          )}
          {erroServidor && !instanceId && (
            <p
              className="flex items-start gap-1.5 text-xs text-destructive"
              data-testid="evolution-erro-servidor"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
              {erroServidor}
            </p>
          )}
        </div>
      </div>

      {/* Escolha entre criar nova instância ou reaproveitar uma existente. */}
      {!instanceId && (
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            {
              valor: "create" as Modo,
              titulo: "Criar nova instância",
              descricao: "A plataforma cria a instância no seu servidor e gera o QR Code.",
              icone: PlusCircle,
            },
            {
              valor: "existing" as Modo,
              titulo: "Usar instância existente",
              // Depois do teste de conexão a contagem já é conhecida: dizer
              // quantas existem evita clicar para descobrir que não há nenhuma.
              descricao: instancias
                ? `${instancias.length} instância(s) neste servidor — escolha uma para conectar ao CRM.`
                : "Escolha uma instância já criada no servidor e conecte ao CRM.",
              icone: ServerCog,
            },
          ]).map((opcao) => {
            const Icone = opcao.icone;
            const ativo = modo === opcao.valor;
            return (
              <button
                key={opcao.valor}
                type="button"
                onClick={() => escolherModo(opcao.valor)}
                disabled={travado}
                className="via-card flex flex-col gap-2 p-4 text-left transition-shadow hover:shadow-md disabled:opacity-60"
                style={ativo ? { borderColor: "var(--via-navy)", borderWidth: 2 } : undefined}
                aria-pressed={ativo}
              >
                <Icone className="h-5 w-5" strokeWidth={1.5} style={{ color: "var(--via-text-primary)" }} />
                <span className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                  {opcao.titulo}
                </span>
                <span className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                  {opcao.descricao}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Criar nova instância */}
      {!instanceId && modo === "create" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="instance_name">Nome da instância</Label>
            <Input
              id="instance_name"
              placeholder="atendimento-principal"
              value={form.instance_name}
              onChange={(e) => setForm({ ...form, instance_name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="display_name">Nome de exibição (opcional)</Label>
            <Input
              id="display_name"
              placeholder="Atendimento Viver de IA"
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            />
          </div>
        </div>
      )}

      {/* Listagem de instâncias existentes */}
      {!instanceId && modo === "existing" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
              Instâncias no servidor
            </p>
            <Button variant="ghost" size="sm" onClick={carregarInstancias} disabled={listar.isPending}>
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${listar.isPending ? "animate-spin" : ""}`} strokeWidth={1.5} />
              Atualizar
            </Button>
          </div>

          {listar.isPending && (
            <p className="flex items-center gap-2 text-sm" style={{ color: "var(--via-text-muted)" }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} />
              Buscando instâncias…
            </p>
          )}

          {!listar.isPending && instancias?.length === 0 && (
            <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
              Nenhuma instância encontrada. Você pode criar uma nova acima.
            </p>
          )}

          {!listar.isPending &&
            instancias?.map((inst) => {
              const ativo = selecionada?.instance_name === inst.instance_name;
              return (
                <button
                  key={inst.instance_name}
                  type="button"
                  onClick={() => setSelecionada(inst)}
                  className="via-card flex w-full items-center justify-between gap-3 p-4 text-left transition-shadow hover:shadow-md"
                  style={ativo ? { borderColor: "var(--via-navy)", borderWidth: 2 } : undefined}
                  aria-pressed={ativo}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                      {inst.instance_name}
                    </p>
                    <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                      {ESTADO_LABEL[inst.state] ?? inst.state}
                      {inst.phone_number ? ` · ${inst.phone_number}` : ""}
                    </p>
                  </div>
                  {ativo && (
                    <CheckCircle2 className="h-5 w-5 shrink-0" strokeWidth={1.5} style={{ color: "var(--via-success)" }} />
                  )}
                </button>
              );
            })}
        </div>
      )}

      {/* Aviso do servidor sem QR */}
      {aviso && !connected && (
        <div className="via-card flex items-start gap-3 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0" strokeWidth={1.5} style={{ color: "var(--via-warning, #b45309)" }} />
          <div className="space-y-2">
            <p className="text-sm" style={{ color: "var(--via-text-body)" }}>{aviso}</p>
            <Button variant="outline" size="sm" onClick={tentarDeNovo} disabled={travado}>
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${travado ? "animate-spin" : ""}`} strokeWidth={1.5} />
              Tentar de novo
            </Button>
          </div>
        </div>
      )}

      {showQr && (
        <div className="via-card flex flex-col items-center gap-3 p-6 text-center" data-testid="evolution-qr">
          <div className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
            <QrCode className="h-4 w-4" strokeWidth={1.5} />
            Escaneie no WhatsApp
          </div>
          <p className="max-w-sm text-xs" style={{ color: "var(--via-text-body)" }}>
            Deixe o celular pronto antes: <strong>WhatsApp › Aparelhos conectados › Conectar
            aparelho</strong>. O código vale poucos segundos e se renova sozinho aqui — escaneie o
            que estiver na tela.
          </p>
          {/* A Evolution devolve o QR como data URL ou base64 puro. */}
          <img
            src={qrAtual.startsWith("data:") ? qrAtual : `data:image/png;base64,${qrAtual}`}
            alt="QR Code para parear o WhatsApp"
            className="h-56 w-56 rounded-lg bg-white p-2"
          />
          <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--via-text-muted)" }}>
            <Loader2 className="h-3 w-3 animate-spin" strokeWidth={1.5} />
            Aguardando pareamento…
          </p>
        </div>
      )}

      {sessaoExpirada && (
        <div className="via-card flex items-start gap-3 p-4" data-testid="evolution-qr-expirado">
          <AlertTriangle className="h-5 w-5 shrink-0" strokeWidth={1.5} style={{ color: "var(--via-warning, #b45309)" }} />
          <div className="space-y-2">
            <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
              A sessão de pareamento expirou
            </p>
            <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
              O WhatsApp encerra a leitura depois de algumas tentativas sem escanear. Abra o
              WhatsApp no celular em Aparelhos conectados, deixe a câmera pronta e gere um código
              novo.
            </p>
            <Button variant="outline" size="sm" onClick={tentarDeNovo} disabled={travado}>
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${travado ? "animate-spin" : ""}`} strokeWidth={1.5} />
              Gerar QR novamente
            </Button>
          </div>
        </div>
      )}

      {connected && (
        <div className="via-card flex items-center gap-3 p-4">
          <CheckCircle2 className="h-6 w-6 shrink-0" strokeWidth={1.5} style={{ color: "var(--via-success)" }} />
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
              WhatsApp conectado
            </p>
            {status?.phone_number && (
              <p className="flex items-center gap-1.5 text-sm" style={{ color: "var(--via-text-muted)" }}>
                <Smartphone className="h-3.5 w-3.5" strokeWidth={1.5} />
                {status.phone_number}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={travado}>
          Voltar
        </Button>
        {connected ? (
          <Button onClick={onConnected}>Continuar</Button>
        ) : instanceId ? (
          <Button variant="outline" onClick={tentarDeNovo} disabled={travado}>
            {travado ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.5} />
                Conectando…
              </>
            ) : (
              "Gerar QR novamente"
            )}
          </Button>
        ) : modo === "existing" ? (
          <Button
            onClick={() => selecionada && conectar(selecionada.instance_name, "existing")}
            disabled={travado || !selecionada}
          >
            {travado ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.5} />
                Conectando…
              </>
            ) : (
              "Conectar instância"
            )}
          </Button>
        ) : (
          <Button onClick={criarNova} disabled={travado || modo !== "create"}>
            {travado ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.5} />
                Conectando…
              </>
            ) : (
              "Criar e gerar QR"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
