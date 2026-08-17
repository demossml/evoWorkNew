/**
 * UsersAccessCard.tsx — управление пользователями (только SUPERADMIN)
 * + карточка «API Evotor» (обновление токена).
 * Рендерится в SettingsNew; если роль не SUPERADMIN — возвращает null.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Users,
  KeyRound,
  ChevronDown,
  ChevronRight,
  Loader2,
  Copy,
  LogOut,
  Plug,
  ShieldCheck,
} from "lucide-react";
import { getAuthHeaders } from "@shared/api";
import { AuthCard } from "./AuthCard";

interface MeResponse {
  authSource: string;
  user: { id: string; login?: string | null; role: string; tenant_id?: string; shopIds?: string[] };
}

interface AppUser {
  id: string;
  login: string;
  display_name: string;
  role: string;
  employee_uuid: string | null;
  is_active: number;
  shopIds: string[];
}

interface TenantShop {
  uuid: string;
  name: string;
}

// Единые auth-заголовки: Bearer-сессия + legacy telegram-id + initData
function apiHeaders(): Record<string, string> {
  return getAuthHeaders();
}

// ─── Пользователи ──────────────────────────────────────────────────────

export function UsersAccessCard() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [checking, setChecking] = useState(true);

  const [users, setUsers] = useState<AppUser[]>([]);
  const [shops, setShops] = useState<TenantShop[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Модалка создания
  const [showCreate, setShowCreate] = useState(false);
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState<"CASHIER" | "ADMIN">("CASHIER");
  const [formShops, setFormShops] = useState<string[]>([]);
  const [createdCreds, setCreatedCreds] = useState<{ login: string; password: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [usersRes, shopsRes] = await Promise.all([
        fetch("/api/users", { headers: apiHeaders() }),
        fetch("/api/tenant/shops", { headers: apiHeaders() }),
      ]);
      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(data.users ?? []);
      }
      if (shopsRes.ok) {
        const data = await shopsRes.json();
        setShops(data.shops ?? []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch("/api/auth/me", { headers: apiHeaders() });
        if (!res.ok) return;
        const data: MeResponse = await res.json();
        setMe(data);
        if (data.user.role === "SUPERADMIN") {
          await load();
        }
      } catch {
        /* ignore */
      } finally {
        setChecking(false);
      }
    };
    void init();
  }, []);

  if (checking) {
    return (
      <div className="mb-4 rounded-xl bg-card border border-border border-l-4 border-l-indigo-500 p-4 animate-pulse">
        <div className="h-4 w-40 bg-muted rounded mb-2" />
        <div className="h-3 w-64 bg-muted rounded" />
      </div>
    );
  }

  // Нет SUPERADMIN-доступа: показываем вход, а не пустоту
  if (!me || me.user.role !== "SUPERADMIN") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border rounded-xl border-l-4 border-l-indigo-500 overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground"><Users className="w-5 h-5" /></span>
            <div>
              <h3 className="text-foreground font-semibold text-sm">Пользователи и доступ</h3>
              <p className="text-[11px] text-muted-foreground">
                Логины и пароли сотрудников, магазины, роли
              </p>
            </div>
          </div>
        </div>
        <div className="px-4 py-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Войдите как владелец (login/password), чтобы управлять доступом сотрудников.
          </p>
          <AuthCard redirectTo="/evotor/settings" />
        </div>
      </motion.div>
    );
  }

  const shopName = (uuid: string) => shops.find((s) => s.uuid === uuid)?.name ?? uuid.slice(0, 8);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({
          display_name: formName,
          role: formRole,
          shop_ids: formShops,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error === "invalid_shop" ? "Ошибка: магазин не принадлежит сети" : "Ошибка создания");
        return;
      }
      setCreatedCreds({ login: data.user.login, password: data.password });
      setShowCreate(false);
      setFormName("");
      setFormShops([]);
      await load();
    } catch {
      setMessage("Ошибка сети");
    }
  };

  const regenPassword = async (user: AppUser) => {
    const res = await fetch(`/api/users/${user.id}/regenerate-password`, {
      method: "POST",
      headers: apiHeaders(),
    });
    const data = await res.json();
    if (res.ok) {
      setCreatedCreds({ login: user.login, password: data.password });
    } else {
      setMessage("Ошибка генерации пароля");
    }
  };

  const regenLogin = async (user: AppUser) => {
    const res = await fetch(`/api/users/${user.id}/regenerate-login`, {
      method: "POST",
      headers: apiHeaders(),
    });
    const data = await res.json();
    if (res.ok) {
      setMessage(`Новый логин: ${data.login}`);
      await load();
    } else {
      setMessage("Ошибка генерации логина");
    }
  };

  const deactivate = async (user: AppUser) => {
    const res = await fetch(`/api/users/${user.id}/deactivate`, {
      method: "POST",
      headers: apiHeaders(),
    });
    if (res.ok) {
      setMessage(`${user.display_name || user.login} деактивирован`);
      await load();
    } else {
      setMessage("Ошибка деактивации");
    }
  };

  const toggleShop = (uuid: string) => {
    setFormShops((prev) =>
      prev.includes(uuid) ? prev.filter((u) => u !== uuid) : [...prev, uuid],
    );
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", headers: apiHeaders() });
    } catch {
      /* ignore */
    }
    localStorage.removeItem("sessionId");
    window.location.replace("/");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-xl border-l-4 border-l-indigo-500 overflow-hidden"
    >
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-border cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-muted-foreground"><Users className="w-5 h-5" /></span>
        <div>
          <h3 className="text-foreground font-semibold text-sm">Пользователи и доступ</h3>
          <p className="text-[11px] text-muted-foreground">
            Логины и пароли сотрудников, магазины, роли
          </p>
        </div>
        <span className="text-muted-foreground text-xs">{users.length} чел.</span>
        <span className="ml-auto flex items-center gap-2 text-muted-foreground">
          <button
            onClick={(e) => {
              e.stopPropagation();
              void logout();
            }}
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded-md bg-muted hover:bg-muted/70 transition"
            title="Выйти"
          >
            <LogOut className="w-3 h-3" /> Выйти
          </button>
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
      </div>

      {expanded && (
        <div className="px-4 py-3 space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && users.length === 0 && (
            <div className="text-xs text-muted-foreground py-2">
              Нет пользователей. Создайте первого продавца.
            </div>
          )}

          {!loading && users.map((user) => (
            <div key={user.id} className="pb-3 border-b border-border last:border-b-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`w-2 h-2 rounded-full ${user.is_active ? "bg-emerald-500" : "bg-red-500"}`} />
                <span className="text-sm text-foreground font-medium">{user.display_name || user.login}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{user.login}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  user.role === "SUPERADMIN"
                    ? "bg-amber-500/15 text-amber-400"
                    : user.role === "ADMIN"
                      ? "bg-blue-500/15 text-blue-400"
                      : "bg-muted text-muted-foreground"
                }`}>
                  {user.role}
                </span>
              </div>

              <div className="flex flex-wrap gap-1 mt-1.5">
                {user.role === "SUPERADMIN" ? (
                  <span className="text-[10px] text-muted-foreground">все магазины</span>
                ) : (
                  user.shopIds.map((sid) => (
                    <span key={sid} className="px-1.5 py-0.5 rounded bg-secondary text-[10px] text-foreground">
                      {shopName(sid)}
                    </span>
                  ))
                )}
              </div>

              {user.role !== "SUPERADMIN" && (
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => regenPassword(user)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded-md bg-muted text-muted-foreground hover:bg-muted/70 transition"
                  >
                    <KeyRound className="w-3 h-3" /> Пароль
                  </button>
                  <button
                    onClick={() => regenLogin(user)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded-md bg-muted text-muted-foreground hover:bg-muted/70 transition"
                  >
                    Логин
                  </button>
                  {user.is_active === 1 && (
                    <button
                      onClick={() => deactivate(user)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[10px] rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
                    >
                      Отключить
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          <button
            onClick={() => setShowCreate(true)}
            className="w-full py-2 rounded-lg bg-indigo-500/15 text-indigo-400 text-xs font-medium hover:bg-indigo-500/25 transition"
          >
            + Создать пользователя
          </button>

          {message && (
            <div className={`text-xs ${message.startsWith("Ошибка") ? "text-red-400" : "text-emerald-400"}`}>
              {message}
            </div>
          )}
        </div>
      )}

      {/* Модалка создания */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card border border-border p-5 shadow-xl">
            <h4 className="text-sm font-semibold text-foreground mb-3">Новый пользователь</h4>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Имя</label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full mt-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none"
                  placeholder="Иван"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Роль</label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as "CASHIER" | "ADMIN")}
                  className="w-full mt-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none"
                >
                  <option value="CASHIER">CASHIER — продавец</option>
                  <option value="ADMIN">ADMIN — администратор</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Магазины</label>
                <div className="mt-1 space-y-1 max-h-40 overflow-y-auto">
                  {shops.map((s) => (
                    <label key={s.uuid} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formShops.includes(s.uuid)}
                        onChange={() => toggleShop(s.uuid)}
                        className="accent-indigo-500"
                      />
                      <span className="text-foreground">{s.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 py-2 rounded-lg bg-muted text-muted-foreground text-xs"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
                >
                  Создать
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Модалка «Сохраните пароль» */}
      {createdCreds && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card border border-border p-5 shadow-xl">
            <h4 className="text-sm font-semibold text-foreground mb-1">Сохраните пароль</h4>
            <p className="text-[11px] text-muted-foreground mb-3">Пароль показывается один раз.</p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between bg-muted rounded-lg px-3 py-2">
                <span className="text-muted-foreground text-xs">Логин</span>
                <span className="font-mono text-foreground">{createdCreds.login}</span>
              </div>
              <div className="flex items-center justify-between bg-muted rounded-lg px-3 py-2">
                <span className="text-muted-foreground text-xs">Пароль</span>
                <span className="font-mono text-foreground">{createdCreds.password}</span>
                <button
                  onClick={() => navigator.clipboard?.writeText(createdCreds.password)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Скопировать"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <button
              onClick={() => setCreatedCreds(null)}
              className="mt-4 w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
            >
              Готово
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ─── API Evotor (токен) ─────────────────────────────────────────────────

export function EvotorTokenCard() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [checking, setChecking] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch("/api/auth/me", { headers: apiHeaders() });
        if (res.ok) setMe(await res.json());
      } catch {
        /* ignore */
      } finally {
        setChecking(false);
      }
    };
    void init();
  }, []);

  if (checking) return null;
  if (!me || me.user.role !== "SUPERADMIN") return null;

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/connect-token", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error === "invalid_token" ? "Токен не принят Эвотором" : "Ошибка");
      } else {
        setMessage("Токен обновлён");
        setToken("");
      }
    } catch {
      setMessage("Ошибка сети");
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-xl border-l-4 border-l-emerald-500 overflow-hidden"
    >
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-border cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-muted-foreground"><Plug className="w-5 h-5" /></span>
        <h3 className="text-foreground font-semibold text-sm">API Evotor</h3>
        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
          <ShieldCheck className="w-3.5 h-3.5" /> подключено
        </span>
        <span className="ml-auto text-muted-foreground">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
      </div>

      {expanded && (
        <form onSubmit={handleUpdate} className="px-4 py-3 space-y-2">
          <label className="text-xs text-muted-foreground">Новый токен API Эвотор</label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-emerald-500/50"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
          <button
            type="submit"
            disabled={busy || !token.trim()}
            className="w-full py-2 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs font-medium hover:bg-emerald-500/25 transition disabled:opacity-50"
          >
            {busy ? "Проверяю..." : "Обновить токен"}
          </button>
          {message && (
            <div className={`text-xs ${message.includes("Ошибка") || message.startsWith("Токен не") ? "text-red-400" : "text-emerald-400"}`}>
              {message}
            </div>
          )}
        </form>
      )}
    </motion.div>
  );
}
