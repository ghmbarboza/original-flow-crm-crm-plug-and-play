import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Send } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useMessageTemplates, useSendTemplateMessage, type MessageTemplate,
} from "@/hooks/useMessageTemplates";
import { conversationName, type Conversation } from "@/hooks/useConversations";
import {
  primeiroNomeDaConversa, renderTemplate, sugerirParametros, variaveisDoTemplate,
} from "@/lib/templateWhatsapp";

const chaveDe = (t: MessageTemplate) => `${t.name}|${t.language}`;

interface Props {
  conversation: Conversation;
  onOpenChange: (open: boolean) => void;
}

/**
 * Escolhe um template aprovado e envia na conversa.
 *
 * As variáveis já vêm com o nome da pessoa onde o template cumprimenta alguém;
 * tudo fica editável e a prévia mostra o texto exato antes de sair. Montado só
 * enquanto aberto: cada abertura começa do zero.
 */
export function SendTemplateDialog({ conversation, onOpenChange }: Props) {
  const { data, isLoading, error } = useMessageTemplates();
  const enviar = useSendTemplateMessage();
  const [chaveEscolhida, setChaveEscolhida] = useState<string | null>(null);
  // Só o que a pessoa digitou; o resto continua vindo da sugestão.
  const [editados, setEditados] = useState<Record<string, string[]>>({});

  // A lista só é buscada quando o canal conectado hoje é oficial. Conversa
  // antiga de Meta ou Zernio numa conta que trocou de canal cai aqui.
  const semCanalOficial = !isLoading && !error && !data;
  const aprovados = (data?.templates ?? []).filter((t) => t.status === "APPROVED");
  const template =
    aprovados.find((t) => chaveDe(t) === chaveEscolhida) ?? (aprovados.length === 1 ? aprovados[0] : null);

  const primeiroNome = primeiroNomeDaConversa(conversation);
  const variaveis = template ? variaveisDoTemplate(template.body_text) : [];
  const parametros = template
    ? editados[chaveDe(template)] ?? sugerirParametros(template.body_text, primeiroNome)
    : [];
  const faltaPreencher = parametros.some((p) => !p.trim());

  const alterarParametro = (indice: number, valor: string) => {
    if (!template) return;
    setEditados((atual) => ({
      ...atual,
      [chaveDe(template)]: parametros.map((p, i) => (i === indice ? valor : p)),
    }));
  };

  const handleEnviar = async () => {
    if (!template || faltaPreencher) return;
    try {
      await enviar.mutateAsync({
        conversationId: conversation.id,
        templateName: template.name,
        templateLanguage: template.language,
        params: parametros.map((p) => p.trim()),
      });
      toast.success("Template enviado.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar o template.");
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="template-dialog">
        <DialogHeader>
          <DialogTitle>Enviar template</DialogTitle>
          <DialogDescription>
            Depois de 24h sem resposta, o WhatsApp só entrega template aprovado. Escolha um e confira
            o texto antes de enviar para {conversationName(conversation)}.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2 py-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : error ? (
          <p className="py-2 text-sm text-via-coral" role="alert">
            {error instanceof Error ? error.message : "Não foi possível carregar os templates."}
          </p>
        ) : semCanalOficial ? (
          <p className="py-2 text-sm" style={{ color: "var(--via-text-body)" }} data-testid="template-sem-canal">
            O canal conectado hoje não é a API Oficial nem o Zernio, então não há templates para
            enviar nesta conversa.
          </p>
        ) : aprovados.length === 0 ? (
          <p className="py-2 text-sm" style={{ color: "var(--via-text-body)" }} data-testid="template-vazio">
            Nenhum template aprovado ainda.{" "}
            <Link to="/settings/campaigns?tab=templates" className="underline">
              Criar um template
            </Link>
          </p>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="template-select">Template</Label>
              <Select value={template ? chaveDe(template) : ""} onValueChange={setChaveEscolhida}>
                <SelectTrigger id="template-select" data-testid="template-select">
                  <SelectValue placeholder="Escolha um template" />
                </SelectTrigger>
                <SelectContent>
                  {aprovados.map((t) => (
                    <SelectItem key={chaveDe(t)} value={chaveDe(t)}>
                      {t.name} ({t.language})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {template && variaveis.map((numero, indice) => (
              <div key={numero} className="space-y-2">
                <Label htmlFor={`template-param-${numero}`}>{`Variável {{${numero}}}`}</Label>
                <Input
                  id={`template-param-${numero}`}
                  data-testid={`template-param-${numero}`}
                  value={parametros[indice] ?? ""}
                  onChange={(e) => alterarParametro(indice, e.target.value)}
                  placeholder="Preencha antes de enviar"
                />
              </div>
            ))}

            {template && (
              <div className="space-y-2">
                <p className="text-xs font-medium" style={{ color: "var(--via-text-muted)" }}>
                  Como vai chegar
                </p>
                <p
                  className="whitespace-pre-wrap rounded-lg px-3 py-2 text-sm"
                  style={{ background: "var(--via-surface)", color: "var(--via-text-primary)" }}
                  data-testid="template-previa"
                >
                  {renderTemplate(template.body_text, parametros.map((p, i) => p || `{{${variaveis[i]}}}`))}
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            className="gap-1.5"
            onClick={handleEnviar}
            disabled={!template || faltaPreencher || enviar.isPending}
            data-testid="template-enviar"
          >
            <Send className="h-4 w-4" strokeWidth={1.5} />
            Enviar template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
