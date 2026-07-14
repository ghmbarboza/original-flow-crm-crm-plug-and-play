import { useState } from "react";
import { LoginForm } from "./LoginForm";
import { SignupForm } from "./SignupForm";

export function AuthLayout() {
  const [isActive, setIsActive] = useState(false);

  return (
    <>
      <style>{`
        .auth-wrap {
          position: relative;
          width: 880px;
          max-width: 100%;
          height: 580px;
          border-radius: 28px;
          overflow: hidden;
          margin: 20px;
          background: linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(247,248,250,0.72) 100%);
          backdrop-filter: blur(28px) saturate(180%);
          -webkit-backdrop-filter: blur(28px) saturate(180%);
          border: 1px solid rgba(255,255,255,0.92);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.95),
            0 32px 80px rgba(10,31,59,0.14),
            0 4px 16px rgba(10,31,59,0.06);
        }
        .auth-form-box {
          position: absolute;
          right: 0;
          width: 50%;
          height: 100%;
          background: transparent;
          display: flex;
          align-items: center;
          color: var(--via-text-body);
          padding: 44px 40px;
          z-index: 1;
          transition: .6s ease-in-out 1.2s, visibility 0s 1s;
        }
        .auth-wrap.active .auth-form-box { right: 50%; }
        /* Only one form is ever visible. The boxes are transparent and overlap,
           so the inactive one must be hidden — otherwise both Login and Signup
           fields render on top of each other ("Email Email", "Senha Senha"). */
        .auth-form-box.register { visibility: hidden; }
        .auth-wrap.active .auth-form-box.register { visibility: visible; }
        .auth-wrap.active .auth-form-box.login { visibility: hidden; }
        .auth-form-inner { width: 100%; }
        .auth-form-inner h2 {
          font-family: 'Geist', system-ui, sans-serif;
          font-size: 1.75rem;
          font-weight: 500;
          letter-spacing: -0.025em;
          color: var(--via-navy);
          margin-bottom: 6px;
        }
        .auth-toggle-box {
          position: absolute;
          width: 100%;
          height: 100%;
        }
        .auth-toggle-box::before {
          content: '';
          position: absolute;
          left: -250%;
          width: 300%;
          height: 100%;
          background: var(--via-mesh-navy);
          border-radius: 150px;
          z-index: 2;
          transition: 1.8s ease-in-out;
        }
        .auth-wrap.active .auth-toggle-box::before { left: 50%; }
        .auth-toggle-panel {
          position: absolute;
          width: 50%;
          height: 100%;
          color: white;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          z-index: 2;
          transition: .6s ease-in-out;
          padding: 40px;
          text-align: center;
          gap: 12px;
        }
        .auth-toggle-panel h2 {
          font-family: 'Geist', system-ui, sans-serif;
          font-size: 1.75rem;
          font-weight: 500;
          letter-spacing: -0.025em;
          color: #fff;
          margin-bottom: 0;
        }
        .auth-toggle-panel p {
          font-size: 0.9375rem;
          opacity: 0.78;
          margin-bottom: 8px;
          line-height: 1.5;
        }
        .auth-toggle-panel.toggle-left { left: 0; transition-delay: 1.2s; }
        .auth-wrap.active .auth-toggle-panel.toggle-left { left: -50%; transition-delay: .6s; }
        .auth-toggle-panel.toggle-right { right: -50%; transition-delay: .6s; }
        .auth-wrap.active .auth-toggle-panel.toggle-right { right: 0; transition-delay: 1.2s; }
        .auth-toggle-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 10px 28px;
          background: transparent;
          border: 1px solid rgba(255,255,255,0.40);
          border-radius: 999px;
          color: white;
          font-family: 'Geist', system-ui, sans-serif;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: -0.004em;
          cursor: pointer;
          transition: border-color 180ms, background 180ms;
        }
        .auth-toggle-btn:hover {
          border-color: rgba(255,255,255,0.65);
          background: rgba(255,255,255,0.08);
        }

        @media (max-width: 850px) {
          .auth-wrap { height: calc(100vh - 40px); max-height: 680px; }
        }
        @media (max-width: 650px) {
          .auth-wrap { height: 100vh; max-height: none; border-radius: 0; margin: 0; }
          .auth-form-box { width: 100%; height: 70%; bottom: 0; right: 0; top: auto; }
          .auth-wrap.active .auth-form-box { right: 0; bottom: 30%; }
          .auth-toggle-box::before { left: 0; top: -270%; width: 100%; height: 300%; border-radius: 20vw; }
          .auth-wrap.active .auth-toggle-box::before { left: 0; top: 70%; }
          .auth-toggle-panel { width: 100%; height: 30%; }
          .auth-toggle-panel.toggle-left { top: 0; left: 0; }
          .auth-wrap.active .auth-toggle-panel.toggle-left { left: 0; top: -30%; }
          .auth-toggle-panel.toggle-right { right: 0; bottom: -30%; top: auto; }
          .auth-wrap.active .auth-toggle-panel.toggle-right { bottom: 0; right: 0; }
        }
      `}</style>

      <main
        className="min-h-screen flex items-center justify-center font-sans"
        style={{ background: "var(--via-white)" }}
      >
        <div className={`auth-wrap ${isActive ? "active" : ""}`}>
          <div className="auth-form-box login">
            <div className="auth-form-inner">
              <h2>Entrar</h2>
              <LoginForm />
            </div>
          </div>

          <div className="auth-form-box register">
            <div className="auth-form-inner">
              <SignupForm />
            </div>
          </div>

          <div className="auth-toggle-box">
            <div className="auth-toggle-panel toggle-left">
              <h2>Olá!</h2>
              <p>Não tem uma conta?<br />Cadastre-se para começar.</p>
              <button type="button" className="auth-toggle-btn" onClick={() => setIsActive(true)}>
                Criar conta
              </button>
            </div>
            <div className="auth-toggle-panel toggle-right">
              <h2>Bem-vindo de volta!</h2>
              <p>Já tem uma conta?<br />Faça login para continuar.</p>
              <button type="button" className="auth-toggle-btn" onClick={() => setIsActive(false)}>
                Entrar
              </button>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
