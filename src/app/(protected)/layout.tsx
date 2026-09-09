"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

// Client-only: DashboardLayout reads localStorage during render initialization.
const ProtectedShell = dynamic(() => import("@/components/ProtectedShell"), { ssr: false });

export default function ProtectedLayout({ children }: { children: ReactNode }) {
    return <ProtectedShell>{children}</ProtectedShell>;
}
