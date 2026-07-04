/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FEATURE_ANALYTICS_DASHBOARD_READONLY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "virtual:pwa-register/react" {
  import type { Dispatch, SetStateAction } from "react";

  export interface RegisterSWOptions {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegistered?: (
      registration: ServiceWorkerRegistration | undefined
    ) => void;
    onRegisterError?: (error: unknown) => void;
  }

  export interface UseRegisterSWReturn {
    offlineReady: boolean;
    needRefresh: boolean;
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  }

  export function useRegisterSW(options?: RegisterSWOptions): {
    needRefresh: [boolean, Dispatch<SetStateAction<boolean>>];
    offlineReady: [boolean, Dispatch<SetStateAction<boolean>>];
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  };
}
