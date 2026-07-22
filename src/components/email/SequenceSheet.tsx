import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, UserPlus } from "lucide-react";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EnrollDialog } from "@/components/email/EnrollDialog";
import { useEmailTemplates } from "@/hooks/useEmailTemplates";
import {
  useDeleteSequenceStep, useSaveSequenceStep, useSequenceSteps,
  type SequenceWithCounts,
} from "@/hooks/useEmailSequences";

const NO_TEMPLATE = "__none__";

interface Props {
  sequence: SequenceWithCounts | null;
  onOpenChange: (open: boolean) => void;
}

export function SequenceSheet({ sequence, onOpenChange }: Props) {
  const { data: steps, isLoading } = useSequenceSteps(sequence?.id ?? null);
  const { data: templates } = useEmailTemplates();
  const saveStep = useSaveSequenceStep();
  const deleteStep = useDeleteSequenceStep();
  const [enrollOpen, setEnrollOpen] = useState(false);

  const addStep = async () => {
    if (!sequence) return;
    try {
      await saveStep.mutateAsync({
        sequence_id: sequence.id,
        delay_days: (steps?.length ?? 0) === 0 ? 0 : 3,
        template_id: null,
        order: steps?.length ?? 0,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível adicionar a etapa.");
    }
  };

  return (
    <>
      <Sheet open={!!sequence} onOpenChange={onOpenChange}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {sequence && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle>{sequence.name}</SheetTitle>
                <SheetDescription>
                  {sequence.enrolledCount} contato(s) inscrito(s). As etapas rodam em ordem, respeitando o delay.
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-4 py-4">
                <Button variant="outline" className="w-full gap-1.5" onClick={() => setEnrollOpen(true)}>
                  <UserPlus className="h-4 w-4" strokeWidth={1.5} />
                  Inscrever contatos
                </Button>

                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Etapas</h3>
                  <Button size="sm" variant="outline" onClick={addStep} className="gap-1.5" disabled={saveStep.isPending}>
                    <Plus className="h-4 w-4" strokeWidth={1.5} />
                    Nova etapa
                  </Button>
                </div>

                {isLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : (steps ?? []).length === 0 ? (
                  <p className="py-4 text-center text-sm" style={{ color: "var(--via-text-muted)" }}>
                    Nenhuma etapa. Adicione o primeiro email da sequência.
                  </p>
                ) : (
                  <ol className="space-y-3">
                    {(steps ?? []).map((step, index) => (
                      <li key={step.id} className="via-card space-y-2 p-3">
                        <div className="flex items-center justify-between">
                          <span
                            className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium"
                            style={{ background: "var(--via-navy)", color: "var(--via-white)" }}
                          >
                            {index + 1}
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteStep.mutate({ id: step.id, sequence_id: sequence.id })}
                            aria-label="Remover etapa"
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                          </Button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs font-normal">Delay (dias)</Label>
                            <Input
                              type="number"
                              min="0"
                              defaultValue={step.delay_days}
                              className="h-8"
                              onBlur={(e) => {
                                const v = Math.max(0, Number(e.target.value) || 0);
                                if (v !== step.delay_days) {
                                  saveStep.mutate({ id: step.id, sequence_id: sequence.id, delay_days: v, template_id: step.template_id, order: step.order });
                                }
                              }}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-normal">Template</Label>
                            <Select
                              value={step.template_id ?? NO_TEMPLATE}
                              onValueChange={(value) =>
                                saveStep.mutate({
                                  id: step.id,
                                  sequence_id: sequence.id,
                                  delay_days: step.delay_days,
                                  template_id: value === NO_TEMPLATE ? null : value,
                                  order: step.order,
                                })
                              }
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue placeholder="Escolha" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NO_TEMPLATE}>Sem template</SelectItem>
                                {(templates ?? []).map((t) => (
                                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <EnrollDialog
        sequenceId={enrollOpen ? sequence?.id ?? null : null}
        onOpenChange={setEnrollOpen}
      />
    </>
  );
}
