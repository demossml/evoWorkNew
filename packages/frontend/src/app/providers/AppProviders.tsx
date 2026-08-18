import type { PropsWithChildren } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { queryClient } from "@shared/api";
import { UserProvider } from "@/hooks/userProvider";
import { AuthGate } from "@/app/AuthGate";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <UserProvider>
          <BrowserRouter>{children}</BrowserRouter>
        </UserProvider>
      </AuthGate>
    </QueryClientProvider>
  );
}
