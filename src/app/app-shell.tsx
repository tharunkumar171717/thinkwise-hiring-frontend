"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

// The app was built as a pure browser SPA (localStorage reads in render
// initializers, etc.), so the entire provider tree renders client-side only -
// identical runtime behavior to the original Vite app.
const Providers = dynamic(() => import("./providers"), { ssr: false });

export default function AppShell({ children }: { children: ReactNode }) {
    return <Providers>{children}</Providers>;
}
