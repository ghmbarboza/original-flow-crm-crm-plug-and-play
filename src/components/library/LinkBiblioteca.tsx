import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LibraryCategory } from "@/hooks/useLibraryTemplates";

/**
 * Atalho para a Biblioteca de Modelos, usado nos empty states.
 *
 * Existe como componente para os cinco pontos de entrada (Sequências, Templates,
 * Automações, Follow-up e Configurações > IA) ficarem idênticos em texto e
 * comportamento. `categoria` já abre a Biblioteca filtrada, para o usuário não
 * cair num catálogo de 16 itens quando o que faltava era uma sequência.
 */
export function LinkBiblioteca({
  categoria,
  rotulo = "Ver modelos",
}: {
  categoria?: LibraryCategory;
  rotulo?: string;
}) {
  const destino = categoria ? `/library?categoria=${categoria}` : "/library";
  return (
    <Button asChild variant="outline" size="sm" className="gap-1.5">
      <Link to={destino} data-testid="link-biblioteca">
        {rotulo}
        <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
      </Link>
    </Button>
  );
}
