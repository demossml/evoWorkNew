import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback, useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Settings,
  MoreHorizontal,
  X,
  FileBarChart,
  Package,
  Store,
  Wallet,
  HandCoins,
  Home,
  DoorOpen,
  NotepadText,
  Maximize2,
  TrendingUp,
} from "lucide-react";
import { isTelegramMiniApp, telegram } from "@/helpers/telegram";

interface BottomNavigationProps {
  employeeRole?: "CASHIER" | "ADMIN" | "SUPERADMIN";
}

/* -------------------- Основное меню -------------------- */

const mainNav = [
  {
    to: "/",
    label: "Главная",
    icon: Home,
    roles: ["CASHIER", "ADMIN", "SUPERADMIN"],
  },
  {
    to: "/evotor/settings",
    label: "Настройки",
    icon: Settings,
    roles: ["SUPERADMIN"],
  },
  {
    to: "/evotor/sales-report",
    label: "Прод. отчёт",
    icon: BarChart3,
    roles: ["ADMIN", "SUPERADMIN", "CASHIER"],
  },
  {
    to: "/evotor/salary-user-report",
    label: "Зарплата",
    icon: HandCoins,
    roles: ["CASHIER", "ADMIN"],
  },
  {
    to: "/evotor/open-store",
    label: "Открытие магазина",
    icon: DoorOpen,
    roles: ["CASHIER", "SUPERADMIN"],
  },
];

/* -------------------- Доп. разделы -------------------- */

const moreButtons = [
  {
    to: "/evotor/salary-report",
    label: "Зарплата",
    icon: HandCoins,
    roles: ["SUPERADMIN"],
  },
  {
    to: "/evotor/dead-stock",
    label: "Dead stock",
    icon: NotepadText,
    roles: ["SUPERADMIN"],
  },
  {
    to: "/evotor/sales-for-the-period",
    label: "Финансовый отчёт",
    icon: FileBarChart,
    roles: ["SUPERADMIN"],
  },
  {
    to: "/evotor/orders",
    label: "Заказ товара",
    icon: Package,
    roles: ["CASHIER", "ADMIN", "SUPERADMIN"],
  },
  {
    to: "/evotor/store-opening-report",
    label: "Открытие магазинов",
    icon: Store,
    roles: ["SUPERADMIN"],
  },
  {
    to: "/evotor/store-openings-admin",
    label: "Открытия (сводка)",
    icon: BarChart3,
    roles: ["SUPERADMIN"],
  },
  {
    to: "/evotor/stock-realization-report",
    label: "Товарные остатки",
    icon: Wallet,
    roles: ["ADMIN", "SUPERADMIN"],
  },
  {
    to: "/evotor/period-comparison",
    label: "Сравнение",
    icon: TrendingUp,
    roles: ["SUPERADMIN"],
  },
];

/* -------------------- Component -------------------- */

export function BottomNavigation({
  employeeRole = "CASHIER",
}: BottomNavigationProps) {
  const [open, setOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  const isMiniApp = isTelegramMiniApp();

  const filteredMainNav = mainNav.filter((i) => i.roles.includes(employeeRole));
  const filteredMoreButtons = moreButtons.filter((i) =>
    i.roles.includes(employeeRole)
  );

  /* ---------- Telegram init ---------- */

  useEffect(() => {
    if (!isMiniApp) return;

    const theme = telegram.WebApp.colorScheme;
    telegram.WebApp.setBackgroundColor(
      theme === "dark" ? "#020617" : "#f8fafc"
    );

    telegram.WebApp.enableClosingConfirmation();

    const handleViewportChanged = () => {
      setIsExpanded(telegram.WebApp.isExpanded);
    };

    telegram.WebApp.onEvent("viewportChanged", handleViewportChanged);
    setIsExpanded(telegram.WebApp.isExpanded);

    return () => {
      telegram.WebApp.offEvent("viewportChanged", handleViewportChanged);
      telegram.WebApp.disableClosingConfirmation();
    };
  }, [isMiniApp]);

  /* ---------- Actions ---------- */

  const handleNavigation = useCallback(() => {
    setOpen(false);
    if (isMiniApp) {
      telegram.WebApp.HapticFeedback.selectionChanged();
    }
  }, [isMiniApp]);

  const openMenu = useCallback(() => {
    setOpen(true);
    if (isMiniApp) {
      telegram.WebApp.HapticFeedback.impactOccurred("light");
      telegram.WebApp.expand();
    }
  }, [isMiniApp]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    if (isMiniApp) {
      telegram.WebApp.HapticFeedback.impactOccurred("light");
    }
  }, [isMiniApp]);

  const expandApp = useCallback(() => {
    if (isMiniApp && !isExpanded) {
      telegram.WebApp.expand();
      telegram.WebApp.HapticFeedback.impactOccurred("medium");
    }
  }, [isMiniApp, isExpanded]);

  /* ---------- Back button ---------- */

  useEffect(() => {
    if (!isMiniApp) return;

    if (open) {
      telegram.WebApp.BackButton.show();
      telegram.WebApp.BackButton.onClick(closeMenu);
    } else {
      telegram.WebApp.BackButton.hide();
      telegram.WebApp.BackButton.offClick(closeMenu);
    }

    return () => {
      telegram.WebApp.BackButton.hide();
      telegram.WebApp.BackButton.offClick(closeMenu);
    };
  }, [open, closeMenu, isMiniApp]);

  useLayoutEffect(() => {
    const navEl = navRef.current;
    if (!navEl) return;

    const setNavHeight = () => {
      const height = Math.round(navEl.getBoundingClientRect().height);
      document.documentElement.style.setProperty(
        "--app-bottom-nav-height",
        `${height}px`
      );
    };

    setNavHeight();

    const observer = new ResizeObserver(setNavHeight);
    observer.observe(navEl);
    window.addEventListener("resize", setNavHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", setNavHeight);
    };
  }, []);

  /* -------------------- Render -------------------- */

  return (
    <>
      <nav
        ref={navRef}
        className="fixed left-0 z-50 w-full border-t border-slate-200/80 bg-white/80 shadow-[0_-8px_30px_rgba(37,99,235,0.14)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/85 dark:shadow-[0_-8px_30px_rgba(30,58,138,0.28)]"
        style={{ bottom: "var(--tg-safe-bottom, 0px)" }}
      >
        <div
          className="flex justify-around py-2"
          style={{ paddingBottom: "calc(0.5rem + var(--tg-safe-bottom, 0px))" }}
        >
          {filteredMainNav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={handleNavigation}
              className="flex flex-col items-center text-slate-500 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs">{label}</span>
            </Link>
          ))}

          {filteredMoreButtons.length > 0 && (
            <button
              onClick={open ? closeMenu : openMenu}
              className="flex flex-col items-center text-slate-500 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="text-xs">Ещё</span>
            </button>
          )}
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px]"
              onClick={closeMenu}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />

            <motion.div
              className="fixed left-0 z-50 w-full rounded-t-2xl border border-slate-200/80 bg-white/88 p-4 shadow-[0_-20px_60px_rgba(37,99,235,0.2)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/90 dark:shadow-[0_-20px_60px_rgba(30,58,138,0.35)]"
              style={{
                bottom: "var(--tg-safe-bottom, 0px)",
                paddingBottom: "calc(2rem + var(--tg-safe-bottom, 0px))",
              }}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Разделы
                </h3>
                <button
                  onClick={closeMenu}
                  className="text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                >
                  <X />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {filteredMoreButtons.map(({ to, label, icon: Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    onClick={handleNavigation}
                    className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/85 px-3 py-3 text-sm font-medium text-slate-700 transition-all hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900/75 dark:text-slate-200 dark:hover:bg-slate-800/90"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                ))}
              </div>

              {isMiniApp && !isExpanded && (
                <button
                  onClick={expandApp}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                >
                  <Maximize2 className="h-4 w-4" />
                  Развернуть
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
