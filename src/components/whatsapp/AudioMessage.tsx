import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "whatsapp-media";
/** Uma hora cobre a escuta sem deixar a URL circulando indefinidamente. */
const VALIDADE_SEGUNDOS = 3600;

/**
 * Player de um áudio da conversa.
 *
 * O bucket é privado, então o `media_url` guardado é o path — a URL de escuta é
 * assinada na hora da exibição.
 */
export function AudioMessage({ path, escuro }: { path: string; escuro: boolean }) {
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

  if (erro) {
    return (
      <p className="text-xs" style={{ color: escuro ? "rgba(255,255,255,0.75)" : "var(--via-text-muted)" }}>
        Áudio indisponível
      </p>
    );
  }

  if (!url) {
    return (
      <p className="text-xs" style={{ color: escuro ? "rgba(255,255,255,0.75)" : "var(--via-text-muted)" }}>
        Carregando áudio…
      </p>
    );
  }

  return <audio controls src={url} className="w-full max-w-[240px]" preload="none" />;
}