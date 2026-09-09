/**
 * Compat shim over `SideDrawerContext` so existing callers (DashboardLayout, JdSidePanel,
 * RequirementDetail) keep working unchanged. New code should use `useSideDrawer()` directly.
 */
import { type ReactNode } from "react";
import { SideDrawerProvider, useSideDrawer } from "./SideDrawerContext";

export type JdViewerRequirement = any;

export function JdViewerProvider({ children }: { children: ReactNode }) {
    return <SideDrawerProvider>{children}</SideDrawerProvider>;
}

export function useJdViewer() {
    const ctx = useSideDrawer();
    return {
        activeReq: ctx.state.mode === "jd" ? ctx.state.req : null,
        isOpen: ctx.state.mode === "jd",
        openJd: ctx.openJd,
        closeJd: () => {
            if (ctx.state.mode === "jd") ctx.close();
        },
    };
}
