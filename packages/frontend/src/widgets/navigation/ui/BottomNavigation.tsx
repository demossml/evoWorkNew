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
  ClipboardCheck,
  Users,
  Boxes,
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
    label: "Моя зарплата",
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

/* -------------------- Доп. разделы, сгруппированные по смыслу --------------------
 * Плоский список из 8 пунктов был неудобен для SUPERADMIN — сгруппировано по
 * той же логике, что и остальные отчёты в приложении.
 */

const moreGroups: Array<{
  title: string;
  items: Array<{ to: string; label: string; icon: typeof Home; roles: string[] }>;
}> = [
  {
    title: "Продажи",
    items: [
      {
        to: "/evotor/period-comparison",
        label: "Сравнение периодов",
        icon: TrendingUp,
        roles: ["SUPERADMIN"],
      },
    ],
  },
  {
    title: "Финансы",
    items: [
      {
        to: "/evotor/salary-report",
        label: "Зарплата сотрудников",
        icon: HandCoins,
        roles: ["SUPERADMIN"],
      },
      {
        to: "/evotor/sales-for-the-period",
        label: "Финансовый отчёт",
        icon: FileBarChart,
        roles: ["SUPERADMIN"],
      },
    ],
  },
  {
    title: "Склад",
    items: [
      {
        to: "/evotor/orders",
        label: "Заказ товара",
        icon: Package,
        roles: ["CASHIER", "ADMIN", "SUPERADMIN"],
      },
      {
        to: "/evotor/stock-realization-report",
        label: "Товарные остатки",
        icon: Wallet,
        roles: ["ADMIN", "SUPERADMIN"],
      },
      {
        to: "/evotor/dead-stock",
        label: "Dead stock",
        icon: NotepadText,
        roles: ["SUPERADMIN"],
      },
    ],
  },
  {
    title: "Аналитика",
    items: [
      {
        to: "/evotor/seller-dna",
        label: "Продавцы",
        icon: Users,
        roles: ["SUPERADMIN"],
      },
      {
        to: "/evotor/product-analysis",
        label: "Товары",
        icon: Boxes,
        roles: ["SUPERADMIN"],
      },
      {
        to: "/evotor/store-analysis",
        label: "Магазины",
        icon: Store,
        roles: ["SUPERADMIN"],
      },
    ],
  },
  {
    title: "Магазины",
    items: [
      {
        to: "/evotor/store-opening-report",
        label: "Открытие магазинов",
        icon: Store,
        roles: ["SUPERADMIN"],
      },
      {
        to: "/evotor/store-openings-admin",
        label: "Открытия (сводка)",
        icon: ClipboardCheck,
        roles: ["SUPERADMIN"],
      },
    ],
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
  const filteredMoreGroups = moreGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((i) => i.roles.includes(employeeRole)),
    }))
    .filter((group) => group.items.length > 0);
  const hasMore = filteredMoreGroups.length > 0;

  /* ---------- Telegram viewport tracking ----------
   * Background color sync and closing-confirmation are owned by useTheme()
   * (called once from App.tsx) — this hook only needs to know whether the
   * Mini App is expanded, to decide whether to show the "Развернуть" button.
   */

  useEffect(() => {
    if (!isMiniApp) return;

    const handleViewportChanged = () => {
      setIsExpanded(telegram.WebApp.isExpanded);
    };

    telegram.WebApp.onEvent("viewportChanged", handleViewportChanged);
    setIsExpanded(telegram.WebApp.isExpanded);

    return () => {
      telegram.WebApp.offEvent("viewportChanged", handleViewportChanged);
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
        className="fixed left-0 z-50 w-full border-t border-border bg-card/85 shadow-[0_-8px_30px_-4px_hsl(var(--foreground)/0.12)] backdrop-blur-xl"
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
              className="flex flex-col items-center text-muted-foreground transition-colors hover:text-primary"
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs">{label}</span>
            </Link>
          ))}

          {hasMore && (
            <button
              onClick={open ? closeMenu : openMenu}
              className="flex flex-col items-center text-muted-foreground transition-colors hover:text-primary"
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
              className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-[2px]"
              onClick={closeMenu}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />

            <motion.div
              className="fixed left-0 z-50 max-h-[75vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card/95 p-4 shadow-[0_-20px_60px_-8px_hsl(var(--foreground)/0.2)] backdrop-blur-xl"
              style={{
                bottom: "var(--tg-safe-bottom, 0px)",
                paddingBottom: "calc(2rem + var(--tg-safe-bottom, 0px))",
              }}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Разделы</h3>
                <button
                  onClick={closeMenu}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X />
                </button>
              </div>

              <div className="space-y-4">
                {filteredMoreGroups.map((group) => (
                  <div key={group.title}>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.title}
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      {group.items.map(({ to, label, icon: Icon }) => (
                        <Link
                          key={to}
                          to={to}
                          onClick={handleNavigation}
                          className="flex items-center gap-2 rounded-xl border border-border bg-background/60 px-3 py-3 text-sm font-medium text-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          {label}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {isMiniApp && !isExpanded && (
                <button
                  onClick={expandApp}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-primary-foreground transition-colors hover:bg-primary/90"
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
