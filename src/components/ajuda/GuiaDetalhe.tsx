import { Link } from "react-router-dom";
import { ArrowRight, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Guia } from "@/lib/ajuda/guias";

/** Guia aberto numa gaveta lateral: para que serve, passo a passo com atalhos e dicas. */
export function GuiaDetalhe({ guia, onClose }: { guia: Guia | null; onClose: () => void }) {
  return (
    <Sheet open={!!guia} onOpenChange={(aberto) => { if (!aberto) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg" data-testid="ajuda-guia">
        {guia && (
          <div className="space-y-5">
            <SheetHeader className="space-y-2 text-left">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{guia.capitulo}</Badge>
                {guia.admin && <Badge variant="outline">Administrador</Badge>}
              </div>
              <SheetTitle>{guia.titulo}</SheetTitle>
              <SheetDescription>{guia.resumo}</SheetDescription>
            </SheetHeader>

            <div className="rounded-md p-3 text-sm" style={{ background: "var(--via-surface)", color: "var(--via-text-body)" }}>
              <span className="font-medium" style={{ color: "var(--via-text-primary)" }}>Para que serve: </span>{guia.paraQue}
            </div>

            <ol className="space-y-3">
              {guia.passos.map((p, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium" style={{ background: "var(--via-navy)", color: "var(--via-white)" }}>{i + 1}</span>
                  <div className="space-y-1 text-sm" style={{ color: "var(--via-text-body)" }}>
                    <p>{p.texto}</p>
                    {p.link && (
                      <Link to={p.link.to} onClick={onClose} className="inline-flex items-center gap-1 text-xs font-medium text-via-blue hover:underline">
                        {p.link.rotulo} <ArrowRight className="h-3 w-3" strokeWidth={1.5} />
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ol>

            {guia.dicas?.length ? (
              <div className="space-y-2 rounded-md border p-3" style={{ borderColor: "var(--via-border)" }}>
                <p className="flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--via-text-primary)" }}><Lightbulb className="h-4 w-4" strokeWidth={1.5} /> Dicas</p>
                <ul className="list-disc space-y-1 pl-5 text-sm" style={{ color: "var(--via-text-body)" }}>
                  {guia.dicas.map((d) => <li key={d}>{d}</li>)}
                </ul>
              </div>
            ) : null}

            <Button asChild className="w-full gap-1.5" data-testid="ajuda-guia-ir">
              <Link to={guia.onde.to} onClick={onClose}>{guia.onde.rotulo} <ArrowRight className="h-4 w-4" strokeWidth={1.5} /></Link>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
