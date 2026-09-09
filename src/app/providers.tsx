"use client";

import { type ReactNode, useState } from "react";
import { AuthProvider } from "../context/AuthContext";
import { ThemeProvider } from "../context/ThemeContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

function makeQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 2 * 60 * 1000,
                gcTime: 10 * 60 * 1000,
                refetchOnWindowFocus: false,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                retry: (failureCount, error: any) => {
                    // Never retry auth or not-found errors - they won't resolve themselves
                    if (error?.message === "Session expired") return false;
                    const status = error?.status ?? error?.response?.status;
                    if (status === 401 || status === 403 || status === 404) return false;
                    return failureCount < 1;
                },
            },
        },
    });
}

export default function Providers({ children }: { children: ReactNode }) {
    const [queryClient] = useState(makeQueryClient);

    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider>
                <AuthProvider>{children}</AuthProvider>
            </ThemeProvider>
        </QueryClientProvider>
    );
}
