import { useUser } from "../hooks/userProvider";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useLayoutEffect, useState, useRef } from "react";
import {
  X,
  Download,
  Smartphone,
  Bell,
  Shield,
  User,
  LogOut,
  Settings,
} from "lucide-react";
import { isTelegramMiniApp, telegram } from "../helpers/telegram";
import { useEmployeeRole } from "../hooks/useApi";
import { useGetReportAndPlan } from "../hooks/useReportData";
import { useGetShopNames } from "../hooks/useGetShopNames";

// Тип события beforeinstallprompt
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export const Topbar = () => {
  const user = useUser();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  const isMiniApp = isTelegramMiniApp();
  const { data: roleData } = useEmployeeRole();
  const { data: shopNames = [] } = useGetShopNames();
  const { data: reportData } = useGetReportAndPlan(shopNames.length > 0);

  // Состояние установки PWA (только для браузера)
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Инициализация Telegram WebApp
  useEffect(() => {
    if (isMiniApp) {
      // Отслеживаем изменение размера окна
      const handleViewportChanged = () => {
        setIsExpanded(telegram.WebApp.isExpanded);
      };

      telegram.WebApp.onEvent("viewportChanged", handleViewportChanged);
      setIsExpanded(telegram.WebApp.isExpanded);

      return () => {
        telegram.WebApp.offEvent("viewportChanged", handleViewportChanged);
      };
    }
  }, []);

  // PWA логика - только для обычного браузера
  useEffect(() => {
    if (isMiniApp) return; // Не показываем PWA установку в Telegram

    const dismissed = localStorage.getItem("pwa-install-dismissed");
    if (dismissed === "true") return;

    const handler = (e: Event) => {
      e.preventDefault();
      const event = e as BeforeInstallPromptEvent;
      setDeferredPrompt(event);
      setIsVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const choiceResult = await deferredPrompt.userChoice;

    if (choiceResult.outcome === "accepted") {
      console.log("✅ Пользователь установил приложение");
    } else {
      console.log("❌ Пользователь отклонил установку");
      localStorage.setItem("pwa-install-dismissed", "true");
    }

    setIsVisible(false);
    setDeferredPrompt(null);
  };

  // Функция для разворачивания окна в Telegram
  const expandApp = () => {
    if (isMiniApp && !isExpanded) {
      telegram.WebApp.expand();
      telegram.WebApp.HapticFeedback.impactOccurred("medium");
    }
  };

  // Подсчет критических алертов
  const getAlertsCount = () => {
    if (!reportData?.reportData?.salesDataByShopName) return 0;

    let alertsCount = 0;
    const salesData = reportData.reportData.salesDataByShopName;
    const shops = Object.entries(salesData);

    if (shops.length === 0) return 0;

    // Вычисляем среднюю выручку
    const avgSales =
      shops.reduce((sum, [, data]) => sum + (data.totalSell || 0), 0) /
      shops.length;

    shops.forEach(([, shopData]) => {
      // Низкие продажи (меньше 50% от средних)
      if (shopData.totalSell < avgSales * 0.5) alertsCount++;

      // Высокий процент возвратов (>10%)
      const refundTotal = Object.values(shopData.refund || {}).reduce(
        (sum, val) => sum + val,
        0
      );
      const refundRate =
        shopData.totalSell > 0 ? (refundTotal / shopData.totalSell) * 100 : 0;
      if (refundRate > 10) alertsCount++;
    });

    return alertsCount;
  };

  // Закрытие меню при клике вне его
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target as Node)
      ) {
        setShowProfileMenu(false);
      }
    };

    if (showProfileMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showProfileMenu]);

  // Получаем данные пользователя из Telegram, если доступны
  const getUserData = () => {
    if (isMiniApp && telegram.WebApp?.initDataUnsafe?.user) {
      const tgUser = telegram.WebApp.initDataUnsafe.user;
      return {
        firstName: tgUser.first_name || "Пользователь",
        photoUrl: tgUser.photo_url,
        username: tgUser.username,
      };
    }
    return {
      firstName: user.first_name || "Evo",
      photoUrl: user.photo_url,
      username: user.username,
    };
  };

  const userData = getUserData();
  const alertsCount = getAlertsCount();

  // Определяем стиль badge роли
  const getRoleBadge = () => {
    const role = roleData?.employeeRole;
    if (!role || role === "null") return null;

    const roleStyles = {
      SUPERADMIN: {
        label: "Admin",
        bg: "from-purple-500 to-purple-600",
        icon: <Shield className="w-3 h-3" />,
      },
      ADMIN: {
        label: "Manager",
        bg: "from-blue-500 to-blue-600",
        icon: <User className="w-3 h-3" />,
      },
      CASHIER: {
        label: "Cashier",
        bg: "from-green-500 to-green-600",
        icon: <User className="w-3 h-3" />,
      },
    };

    return roleStyles[role as keyof typeof roleStyles] || null;
  };

  const roleBadge = getRoleBadge();

  useLayoutEffect(() => {
    const headerEl = headerRef.current;
    if (!headerEl) return;

    const setHeaderHeight = () => {
      const height = Math.round(headerEl.getBoundingClientRect().height);
      document.documentElement.style.setProperty(
        "--app-topbar-height",
        `${height}px`
      );
    };

    setHeaderHeight();

    const observer = new ResizeObserver(setHeaderHeight);
    observer.observe(headerEl);
    window.addEventListener("resize", setHeaderHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", setHeaderHeight);
    };
  }, []);

  return (
    <motion.header
      ref={headerRef}
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="fixed left-0 w-full z-50 border-b border-white/10 bg-slate-900/85 backdrop-blur-xl shadow-lg"
      style={{ top: "var(--tg-app-top-offset, var(--tg-safe-top, 0px))" }}
    >
      <div className="flex min-h-14 items-center justify-between gap-2 px-3 py-2">
        {/* Приветствие и роль */}
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-base font-semibold text-white">
            {userData.firstName}
          </span>
          {roleBadge && (
            <span
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r ${roleBadge.bg} text-white text-xs font-semibold shadow-sm`}
            >
              {roleBadge.icon}
              {roleBadge.label}
            </span>
          )}
        </div>

        {/* Кнопки и аватар */}
        <div className="flex items-center gap-2">
          {/* Badge уведомлений */}
          {alertsCount > 0 && roleData?.employeeRole !== "CASHIER" && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="relative"
            >
              <Bell className="w-5 h-5 text-orange-500 dark:text-orange-400" />
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {alertsCount}
              </span>
            </motion.div>
          )}

          {/* Кнопка разворачивания для Telegram */}
          {isMiniApp && !isExpanded && (
            <motion.button
              onClick={expandApp}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1 bg-gradient-to-r from-green-500 to-green-600 text-white text-xs font-medium px-2 py-1 rounded-lg shadow-md hover:from-green-600 hover:to-green-700 transition-all"
            >
              <Smartphone className="w-3 h-3" />
            </motion.button>
          )}

          {/* Кнопка настроек для Telegram */}
          {/* {isTelegramMiniApp && (
            <motion.button
              onClick={openSettings}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1 bg-gray-500 text-white text-xs font-medium px-2 py-1 rounded-lg shadow hover:bg-gray-600 transition-all"
            >
              ⚙️
            </motion.button>
          )} */}

          {/* Кнопка установки PWA (только для браузера) */}
          <AnimatePresence>
            {isVisible && !isTelegramMiniApp() && (
              <motion.button
                onClick={handleInstallClick}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              className="flex items-center gap-1 bg-blue-600 text-white text-sm font-medium px-3 py-1.5 rounded-xl shadow hover:bg-blue-700 transition-all"
            >
              <Download className="w-4 h-4" />
              Установить
              </motion.button>
            )}
          </AnimatePresence>

          {/* Аватар с меню */}
          <div className="relative" ref={profileMenuRef}>
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setShowProfileMenu(!showProfileMenu);
                if (isMiniApp) {
                  telegram.WebApp.HapticFeedback.impactOccurred("light");
                }
              }}
              className="mr-1"
            >
              {userData.photoUrl ? (
                <img
                  src={userData.photoUrl}
                  alt="User"
                  className="h-9 w-9 rounded-full border-2 border-white/25 shadow-md transition-colors hover:border-cyan-300"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white/25 bg-gradient-to-br from-cyan-500 to-blue-600 p-1.5 text-white shadow-md">
                  <User className="h-5 w-5" />
                </div>
              )}
            </motion.button>

            {/* Всплывающее меню профиля */}
            <AnimatePresence>
              {showProfileMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50"
                >
                  {/* Заголовок меню */}
                  <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-4 text-white">
                    <div className="flex items-center gap-3">
                      {userData.photoUrl ? (
                        <img
                          src={userData.photoUrl}
                          alt="User"
                          className="w-12 h-12 rounded-full border-2 border-white shadow-md"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                          <User className="w-6 h-6" />
                        </div>
                      )}
                      <div>
                        <p className="font-bold text-sm">
                          {userData.firstName}
                        </p>
                        {userData.username && (
                          <p className="text-xs opacity-90">
                            @{userData.username}
                          </p>
                        )}
                        {roleBadge && (
                          <span className="inline-block mt-1 px-2 py-0.5 bg-white/20 rounded-full text-xs font-semibold">
                            {roleBadge.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Пункты меню */}
                  <div className="p-2">
                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        // Переход в настройки
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300"
                    >
                      <Settings className="w-4 h-4" />
                      <span className="text-sm font-medium">Настройки</span>
                    </button>

                    {alertsCount > 0 && (
                      <button
                        onClick={() => {
                          setShowProfileMenu(false);
                          // Переход к алертам
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300"
                      >
                        <Bell className="w-4 h-4" />
                        <span className="text-sm font-medium">Уведомления</span>
                        <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                          {alertsCount}
                        </span>
                      </button>
                    )}

                    <div className="border-t border-gray-200 dark:border-gray-700 my-2" />

                    <button
                      onClick={() => {
                        setShowProfileMenu(false);
                        // Clear cached user state
                        localStorage.removeItem("telegram-id");
                        localStorage.removeItem("pwa-install-dismissed");
                        if (isMiniApp) {
                          telegram.WebApp.close();
                        } else {
                          window.location.reload();
                        }
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-600 dark:text-red-400"
                    >
                      <LogOut className="w-4 h-4" />
                      <span className="text-sm font-medium">Выйти</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Всплывающее окно уведомления PWA (только для браузера) */}
      <AnimatePresence>
        {isVisible && !isTelegramMiniApp() && (
          <motion.div
            className="absolute top-full left-0 w-full bg-blue-50 dark:bg-blue-900 text-blue-900 dark:text-blue-100 text-center py-2 border-t border-blue-200 dark:border-blue-800"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="flex justify-center items-center gap-2">
              <span>
                Добавь приложение на главный экран для быстрого доступа
              </span>
              <button
                onClick={() => setIsVisible(false)}
                className="text-blue-500 hover:text-blue-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Информация о Telegram WebApp (только для разработки) */}
      {isMiniApp && process.env.NODE_ENV === "development" && (
        <div className="absolute top-full left-0 w-full bg-yellow-50 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 text-xs text-center py-1">
          Telegram Mini App v{telegram.WebApp.version} •{" "}
          {isExpanded ? "Развернут" : "Свернут"}
        </div>
      )}
    </motion.header>
  );
};
