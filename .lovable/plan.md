Tornar admin@admin.com administrador da plataforma

Situação atual (confirmada no banco): a conta existe, está ativa, mas ainda não foi aprovada (por isso cai na tela "aguardando aprovação"), tem papel "member" e nenhum papel de CRM.

O que será feito (só dados, sem mudar código):
1. Aprovar a conta (is_approved = true).
2. Trocar o papel de "member" para "admin".
3. Definir o papel de CRM como "diretor" (acesso total no CRM).

Depois disso, basta sair e entrar de novo (ou recarregar) para ver o app completo com acesso de administrador.

Detalhes técnicos
- update profiles set is_approved=true, crm_role='diretor' where id='f3dd27ba-...'
- delete from user_roles where user_id=... and role='member'; insert (user_id, 'admin') on conflict do nothing.
