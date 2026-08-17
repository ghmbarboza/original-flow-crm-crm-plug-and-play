import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { erroDeFunction } from "@/integrations/supabase/functionError";
import type { AppRole, AuthContextValue, Profile } from "@/types/auth";
import { AuthContext } from "@/contexts/auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const loadedFor = useRef<string | null>(null);
  const accessTokenRef = useRef<string | null>(null);

  const loadProfileAndRole = useCallback(async (uid: string) => {
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid).order("role").maybeSingle(),
    ]);
    setProfile((p as Profile) ?? null);
    setRole((r?.role as AppRole) ?? null);
  }, []);

  const checkActiveStatus = useCallback(async () => {
    try {
      // Só faz sentido com sessão viva; sem token o endpoint devolveria 401.
      const { data: { session: current } } = await supabase.auth.getSession();
      if (!current?.access_token) return;
      const { data } = await supabase.functions.invoke("check-user-active");
      // Only sign out when explicitly inactive. Unapproved users go to /pending-approval.
      if (data && data.active === false) {
        await supabase.auth.signOut();
      }
    } catch (_) { /* ignore */ }
  }, []);

  useEffect(() => {
    let active = true;

    // Loading is "done" the moment the first session check resolves — NOT when the
    // profile finishes loading. The profile/role load in the background and routes
    // render optimistically, so navigation never shows a spinner.
    const settleLoading = () => {
      if (active) setIsLoading(false);
    };

    // Load profile/role at most once per user id; deferred out of the auth callback
    // per Supabase guidance (no awaiting Supabase calls inside onAuthStateChange).
    const maybeLoadProfile = (uid: string) => {
      if (loadedFor.current === uid) return;
      loadedFor.current = uid;
      setTimeout(() => {
        if (!active) return;
        loadProfileAndRole(uid);
        checkActiveStatus();
      }, 0);
    };

    const applySession = (sess: Session | null) => {
      const nextUser = sess?.user ?? null;
      accessTokenRef.current = sess?.access_token ?? null;
      // Keep context references stable on TOKEN_REFRESHED / tab-focus when the user
      // has not changed, so consumers don't re-render needlessly.
      setSession((prev) => (prev?.user?.id === nextUser?.id ? prev : sess));
      setUser((prev) => (prev?.id === nextUser?.id ? prev : nextUser));

      if (!nextUser) {
        setProfile(null); setRole(null); loadedFor.current = null;
      } else {
        maybeLoadProfile(nextUser.id);
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      applySession(sess);
      // The first auth event (INITIAL_SESSION) means the session has been resolved.
      settleLoading();
    });

    // Single explicit session read as a fallback in case INITIAL_SESSION is delayed.
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      applySession(s);
      settleLoading();
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [loadProfileAndRole, checkActiveStatus]);

  // Mark offline on unload
  useEffect(() => {
    const handler = () => {
      if (!user) return;
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`;
        const body = JSON.stringify({ status: "offline" });
        fetch(url, {
          method: "PATCH",
          keepalive: true,
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${accessTokenRef.current ?? ""}`,
          },
          body,
        });
      } catch {
        // Best-effort: roda no beforeunload, quando a aba já está fechando.
        // Falhar aqui não tem tratamento útil nem tela para mostrar erro.
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [user]);

  const signIn: AuthContextValue["signIn"] = async (email, password) => {
    const { error, data } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    if (!data.user) return { error: "Falha no login." };

    // Fetch approval/active state immediately so caller can route correctly.
    const { data: prof } = await supabase
      .from("profiles")
      .select("is_approved, is_active")
      .eq("id", data.user.id)
      .maybeSingle();

    const isActive = prof ? !!prof.is_active : true;
    const isApproved = prof ? !!prof.is_approved : false;

    if (!isActive) {
      await supabase.auth.signOut();
      return { error: "Sua conta foi desativada." };
    }

    await supabase.from("profiles").update({ status: "online" }).eq("id", data.user.id);
    return { isApproved, isActive };
  };

  const signUp: AuthContextValue["signUp"] = async (fullName, email, password) => {
    const { data: vd, error: vErr } = await supabase.functions.invoke("validate-signup", { body: { email } });
    if (vErr) return { error: (await erroDeFunction(vErr, "Falha ao validar cadastro.")).message };
    if (vd && vd.allowed === false) return { error: vd.message ?? "Cadastro não permitido." };

    const redirectUrl = `${window.location.origin}/`;
    const { data: signUpData, error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: redirectUrl, data: { full_name: fullName } },
    });
    if (error) return { error: error.message };

    // Determine approval status; if the on_auth_user_created trigger did not run
    // (common after a remix), fall back to the bootstrap-profile edge function.
    let isApproved: boolean | undefined = undefined;
    const newUserId = signUpData.user?.id;
    const hasSession = !!signUpData.session;

    if (newUserId) {
      const { data: prof } = await supabase
        .from("profiles").select("is_approved").eq("id", newUserId).maybeSingle();
      if (prof) {
        isApproved = !!prof.is_approved;
      } else if (hasSession) {
        // Profile missing — invoke fallback to recreate it idempotently.
        try {
          const { data: boot } = await supabase.functions.invoke("bootstrap-profile");
          if (boot && typeof boot.isApproved === "boolean") {
            isApproved = boot.isApproved;
            // Refresh local profile/role caches.
            await loadProfileAndRole(newUserId);
          }
        } catch (_) { /* swallow — caller falls back to email-confirmation message */ }
      }
    }
    return { pending: true, isApproved };
  };

  const signOut = async () => {
    if (user) {
      try {
        await supabase.from("profiles").update({ status: "offline" }).eq("id", user.id);
      } catch {
        // Marcar offline é cortesia: se falhar, o logout precisa acontecer
        // do mesmo jeito. Erro aqui não pode impedir o signOut abaixo.
      }
    }
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    if (user) await loadProfileAndRole(user.id);
  };

  const value = useMemo<AuthContextValue>(() => ({
    user, session, profile, role, isLoading,
    isAdmin: role === "admin",
    isMember: role === "member",
    isApproved: !!profile?.is_approved,
    isActive: profile ? profile.is_active : true,
    isPendingApproval: !!profile && profile.is_active && !profile.is_approved,
    signIn, signUp, signOut, refreshProfile,
  }), [user, session, profile, role, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
