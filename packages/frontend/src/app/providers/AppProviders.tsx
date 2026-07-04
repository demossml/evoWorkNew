import type { PropsWithChildren } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { queryClient } from "@shared/api";
import { UserProvider } from "@/hooks/userProvider";

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <BrowserRouter>{children}</BrowserRouter>
      </UserProvider>
    </QueryClientProvider>
  );
}
