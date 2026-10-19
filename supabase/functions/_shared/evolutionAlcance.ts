// Servidor Evolution fora do ar (ou endereço errado): o fetch do Deno lança um
// TypeError ("error sending request for url ...") que chegava à tela como um
// 500 genérico só em toast. Era o que acontecia quando o QR "não abria": não
// existia servidor vivo, e a tela não dizia isso.

/** True quando a falha foi de rede ou TLS, antes de qualquer resposta HTTP. */
export function falhaDeAlcance(err: unknown): boolean {
  return err instanceof TypeError;
}

export function mensagemServidorInalcancavel(serverUrl: string, err: unknown): string {
  const detalhe = (err instanceof Error ? err.message : String(err)).slice(0, 160);
  return (
    `Não foi possível alcançar o servidor Evolution em ${serverUrl}. ` +
    "Confira se ele está no ar e se o endereço está certo (sem /manager no fim). " +
    `Detalhe técnico: ${detalhe}`
  );
}
