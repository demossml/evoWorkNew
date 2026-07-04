import { useLocation } from "react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PWAInstall } from "./pwa";
import { useEmployeeRole } from "./hooks/useApi";
import { useTheme } from "./hooks/useTheme";
import { useUser } from "./hooks/userProvider";
import {
  startBackgroundUpload,
  hasFilesInQueue,
} from "./helpers/backgroundUploader";
import { trackEvent } from "./helpers/analytics";
import { useTelegramFullscreenLayout } from "./hooks/useTelegramFullscreenLayout";
import { AppRouter } from "@app/router";
import { BottomNavigation } from "@widgets/navigation";
import { fetchDataMode, queryKeys } from "@shared/api";
import { ErrorBoundary } from "@shared/ui/states/ErrorBoundary";

function App() {
  const { data } = useEmployeeRole();
  const tg = useUser();
  const userId = tg?.id?.toString();
  const location = useLocation();

  useTheme();
  useTelegramFullscreenLayout();

  useQuery({
    queryKey: queryKeys.admin.dataMode(),
    queryFn: fetchDataMode,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  const [uploadStatus, setUploadStatus] = useState<{
    isUploading: boolean;
    uploaded: number;
    total: number;
  }>({ isUploading: false, uploaded: 0, total: 0 });

  // Фоновая загрузка файлов при открытии приложения
  useEffect(() => {
    if (!userId) return;

    const checkAndUpload = async () => {
      const hasFiles = await hasFilesInQueue(userId);

      if (hasFiles) {
        console.log(
          "📤 Обнаружены файлы в очереди, начинаю фоновую загрузку..."
        );
        setUploadStatus({ isUploading: true, uploaded: 0, total: 0 });

        try {
          const result = await startBackgroundUpload(
            userId,
            (uploaded, total) => {
              setUploadStatus({ isUploading: true, uploaded, total });
            }
          );

          console.log(
            `✅ Фоновая загрузка завершена: ${result.uploaded} успешно, ${result.failed} ошибок`
          );
        } catch (error) {
          console.error("❌ Ошибка фоновой загрузки:", error);
        } finally {
          setUploadStatus({ isUploading: false, uploaded: 0, total: 0 });
        }
      }
    };

    // Запускаем проверку через 2 секунды после загрузки
    const timer = setTimeout(checkAndUpload, 2000);

    const onOnline = () => {
      void checkAndUpload();
    };
    window.addEventListener("online", onOnline);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [userId]);

  useEffect(() => {
    const screen = location.pathname || "/";
    void trackEvent("screen_open", { screen });
    return () => {
      void trackEvent("screen_close", { screen });
    };
  }, [location.pathname]);

  return (
    <>
      <PWAInstall />
      {/* Индикатор фоновой загрузки */}
      {uploadStatus.isUploading && uploadStatus.total > 0 && (
        <div
          className="fixed right-4 z-50 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg animate-pulse"
          style={{
            top: "calc(var(--tg-app-top-offset, var(--tg-safe-top, 0px)) + 0.5rem)",
          }}
        >
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">
              Загружаю фото: {uploadStatus.uploaded} / {uploadStatus.total}
            </span>
          </div>
        </div>
      )}
      {/* <div className="pb-20"> */} {/* отступ снизу под меню */}
      <main className="app-shell-main">
        <ErrorBoundary>
          <AppRouter />
        </ErrorBoundary>
      </main>
      {(() => {
        const allowedRoles = ["SUPERADMIN", "CASHIER", "ADMIN"];
        const role = allowedRoles.includes(data?.employeeRole ?? "")
          ? (data?.employeeRole as "SUPERADMIN" | "CASHIER" | "ADMIN")
          : "CASHIER";
        return <BottomNavigation employeeRole={role} />;
      })()}
    </>
  );
}

export default App;
