import { useState, useMemo } from "react";
import { useTeamManagement } from "@/hooks/useTeamManagement";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { AppRole } from "@/types/auth";

export default function TeamSettings() {
  const { members, isLoading, approveMember, rejectMember, changeRole, deactivateMember, reactivateMember } = useTeamManagement();
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const signupUrl = `${window.location.origin}/auth`;

  const copySignupLink = async () => {
    await navigator.clipboard.writeText(signupUrl);
    toast.success("Link copiado");
  };

  const filtered = useMemo(() => members.filter((m) => {
    if (roleFilter !== "all" && m.role !== roleFilter) return false;
    if (statusFilter === "active" && !(m.is_approved && m.is_active)) return false;
    if (statusFilter === "inactive" && !(m.is_approved && !m.is_active)) return false;
    if (statusFilter === "pending" && m.is_approved) return false;
    return true;
  }), [members, roleFilter, statusFilter]);

  const roleColor = (r: AppRole | null) =>
    r === "admin" ? "bg-accent text-accent-foreground"
      : "bg-secondary text-secondary-foreground";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas permissões</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="member">Membro</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="inactive">Inativos</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="h-4 w-4 mr-1" /> Novo usuário
        </Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Permissões</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum membro</TableCell></TableRow>
            ) : filtered.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={m.avatar_url ?? undefined} />
                      <AvatarFallback>{m.full_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span>{m.full_name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{m.email}</TableCell>
                <TableCell>
                  <Select value={m.role ?? "member"} onValueChange={(v) => changeRole.mutate({ userId: m.id, newRole: v as AppRole })}>
                    <SelectTrigger className="w-[140px]">
                      <Badge className={roleColor(m.role)}>{m.role ?? "—"}</Badge>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">admin</SelectItem>
                      <SelectItem value="member">member</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  {!m.is_approved && <Badge className="bg-warning text-warning-foreground">Pendente</Badge>}
                  {m.is_approved && m.is_active && <Badge className="bg-success text-success-foreground">Ativo</Badge>}
                  {m.is_approved && !m.is_active && <Badge variant="destructive">Inativo</Badge>}
                </TableCell>
                <TableCell className="text-right space-x-2">
                  {!m.is_approved && (
                    <>
                      <Button size="sm" onClick={() => approveMember.mutate(m.id)}>Aprovar</Button>
                      <Button size="sm" variant="outline" onClick={() => rejectMember.mutate(m.id)}>Rejeitar</Button>
                    </>
                  )}
                  {m.is_approved && m.is_active && (
                    <Button size="sm" variant="outline" onClick={() => deactivateMember.mutate(m.id)}>Desativar</Button>
                  )}
                  {m.is_approved && !m.is_active && (
                    <Button size="sm" onClick={() => reactivateMember.mutate(m.id)}>Reativar</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convidar novo usuário</DialogTitle>
            <DialogDescription>
              Compartilhe o link de cadastro abaixo. Após o registro, o novo usuário aparecerá aqui como pendente e poderá ser aprovado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Link de cadastro</Label>
            <div className="flex gap-2">
              <Input readOnly value={signupUrl} />
              <Button variant="outline" onClick={copySignupLink}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setInviteOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
