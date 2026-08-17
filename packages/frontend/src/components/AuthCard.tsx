/**
 * AuthCard.tsx — вход по login/password + подключение Evotor-токена (владелец).
 * Legacy Telegram-вход остаётся в RegisterUserCard.
 */

import { useState } from "react";
import { KeyRound, Link2, Loader2, Eye, EyeOff, Copy } from "lucide-react";

type Mode = "login" | "connect";

export function AuthCard({ redirectTo = "/" }: { redirectTo?: string }) {
  const [mode, setMode] = useState<Mode>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // login
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);

  // connect
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [created, setCreated] = useState<{ login: string; password: string } | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.sessionId) {
        setError("Неверный логин или пароль");
        return;
      }
      localStorage.setItem("sessionId", data.sessionId);
      // Полная перезагрузка на целевой странице — me и карточки перечитаются
      window.location.assign(redirectTo);
    } catch {
      setError("Ошибка сети");
    } finally {
      setBusy(false);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const res = await fetch("/api/auth/connect-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim(), name: name.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.sessionId) {
        setError(data.error === "invalid_token" ? "Токен не принят Эвотором" : "Ошибка подключения");
        return;
      }
      if (data.generatedPassword) {
        setCreated({ login: data.user.login, password: data.generatedPassword });
        return; // ждём, пока владелец сохранит пароль
      }
      localStorage.setItem("sessionId", data.sessionId);
      window.location.assign(redirectTo);
    } catch {
      setError("Ошибка сети");
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <div className="w-full max-w-sm rounded-2xl bg-card border border-border p-5 shadow-lg">
        <h2 className="text-base font-bold text-foreground mb-2">Сохраните данные входа</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Пароль показывается один раз. После входа вы сможете создавать логины продавцам в Настройках.
        </p>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between bg-muted rounded-lg px-3 py-2">
            <span className="text-muted-foreground text-xs">Логин</span>
            <span className="font-mono text-foreground">{created.login}</span>
          </div>
          <div className="flex items-center justify-between bg-muted rounded-lg px-3 py-2">
            <span className="text-muted-foreground text-xs">Пароль</span>
            <span className="font-mono text-foreground">{created.password}</span>
            <button
              onClick={() => navigator.clipboard?.writeText(created.password)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Скопировать"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <button
          onClick={() => {
            // session уже в localStorage? Нет — при создании вернулись без saveSession.
            // Повторный вход по сохранённым данным.
            setMode("login");
            setLogin(created.login);
            setPassword(created.password);
            setCreated(null);
          }}
          className="mt-4 w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
        >
          Перейти ко входу
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm rounded-2xl bg-card border border-border p-5 shadow-lg">
      {/* Переключатель */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg mb-4">
        <button
          onClick={() => setMode("login")}
          className={`flex-1 py-1.5 text-xs rounded-md transition ${
            mode === "login" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          Вход
        </button>
        <button
          onClick={() => setMode("connect")}
          className={`flex-1 py-1.5 text-xs rounded-md transition ${
            mode === "connect" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          Подключить Evotor
        </button>
      </div>

      {mode === "login" ? (
        <form onSubmit={handleLogin} className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Логин</label>
            <input
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              className="w-full mt-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50"
              placeholder="seller_xxxxxx"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Пароль</label>
            <div className="relative mt-1">
              <input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 pr-9 text-sm text-foreground focus:outline-none focus:border-blue-500/50"
                placeholder="••••••••••••"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Показать пароль"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          {error && <div className="text-xs text-red-400">{error}</div>}
          <button
            type="submit"
            disabled={busy || !login || !password}
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            Войти
          </button>
        </form>
      ) : (
        <form onSubmit={handleConnect} className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Токен API Эвотор</label>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full mt-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-blue-500/50"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Название сети (необязательно)</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full mt-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-blue-500/50"
              placeholder="Моя сеть"
            />
          </div>
          {error && <div className="text-xs text-red-400">{error}</div>}
          <button
            type="submit"
            disabled={busy || !token.trim()}
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            Подключить
          </button>
        </form>
      )}
    </div>
  );
}
