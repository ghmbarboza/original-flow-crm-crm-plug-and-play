import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "whatsapp-media";
/** Mesma validade do áudio: cobre a visualização sem deixar a URL circulando. */
const VALIDADE_SEGUNDOS = 3600;

/**
 * Imagem, vídeo ou documento recebido na conversa.
 *
 * O bucket é privado e o `media_url` guardado é o caminho, não a URL — a de
 * exibição é assinada na hora, como no áudio. Foto que o cliente manda costuma
 * ser documento, comprovante ou o produto: some daqui e a equipe perde a
 * informação sem nem saber que existiu.
 */
export function MediaMessage({
  path,
  tipo,
  escuro,
}: {
  path: string;
  tipo: "image" | "video" | "document";
  escuro: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let ativo = true;
    setUrl(null);
    setErro(false);
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, VALIDADE_SEGUNDOS)
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error || !data?.signedUrl) setErro(true);
        else setUrl(data.signedUrl);
      });
    return () => {
      ativo = false;
    };
  }, [path]);

  const corSuave = escuro ? "rgba(255,255,255,0.75)" : "var(--via-text-muted)";

  if (erro) {
    return <p className="text-xs" style={{ color: corSuave }}>Arquivo indisponível</p>;
  }
  if (!url) {
    return <p className="text-xs" style={{ color: corSuave }}>Carregando arquivo…</p>;
  }

  if (tipo === "image") {
    return (
      // Abre em nova aba: dentro da bolha a imagem fica pequena demais para ler
      // um comprovante ou um documento fotografado.
      <a href={url} target="_blank" rel="noreferrer">
        <img
          src={url}
          alt="Imagem recebida na conversa"
          className="max-h-64 w-full rounded-lg object-cover"
          loading="lazy"
        />
      </a>
    );
  }

  if (tipo === "video") {
    return <video src={url} controls className="max-h-64 w-full rounded-lg" />;
  }

  const nome = decodeURIComponent(path.split("/").pop() ?? "arquivo").replace(/^\d+-/, "");
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm underline underline-offset-2"
      style={{ color: escuro ? "var(--via-white)" : "var(--via-text-primary)" }}
    >
      <FileText className="h-4 w-4 shrink-0" strokeWidth={1.5} />
      <span className="min-w-0 flex-1 truncate">{nome}</span>
      <Download className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
    </a>
  );
}
