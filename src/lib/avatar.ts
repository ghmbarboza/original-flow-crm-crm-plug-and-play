/**
 * Fotos de perfil do WhatsApp vêm de um CDN com URL assinada que vence
 * (parâmetro `oe`, hex de segundos Unix). Depois de vencida a imagem responde
 * 403: cada abertura do inbox gerava dezenas de erros de rede e de console. Sem
 * `oe` a URL é tratada como válida; o `onError` da imagem continua como reserva.
 */
export function avatarAindaValido(url: string | null | undefined, agora = Date.now()): boolean {
  if (!url) return false;
  try {
    const oe = new URL(url).searchParams.get("oe");
    if (!oe) return true;
    const vence = parseInt(oe, 16);
    if (!Number.isFinite(vence)) return true;
    return vence * 1000 > agora;
  } catch {
    return false;
  }
}
