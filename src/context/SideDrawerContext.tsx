import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type ProfileAction = "view" | "submit" | "update";
export type ProfileViewTab = "overview" | "deterministic" | "llm" | "comments" | "scorecard" | "analysis";

export type SideDrawerState =
    | { mode: "closed" }
    | { mode: "jd"; req: any }
    | { mode: "profile"; jdId: string; profile: any; action: ProfileAction; initialTab?: ProfileViewTab }
    | { mode: "resume"; candidateId: string; candidateName?: string };

interface SideDrawerCtxValue {
    state: SideDrawerState;
    isOpen: boolean;
    openJd: (req: any) => void;
    openProfile: (jdId: string, profile: any, action?: ProfileAction, initialTab?: ProfileViewTab) => void;
    openResume: (candidateId: string, candidateName?: string) => void;
    close: () => void;
    patchProfile: (next: any) => void;
    profileChangeCounter: number;
    notifyProfileChanged: () => void;
}

const SideDrawerCtx = createContext<SideDrawerCtxValue | null>(null);

export function SideDrawerProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<SideDrawerState>({ mode: "closed" });
    const [profileChangeCounter, setProfileChangeCounter] = useState(0);

    const openJd = useCallback((req: any) => setState({ mode: "jd", req }), []);
    const openProfile = useCallback(
        (jdId: string, profile: any, action: ProfileAction = "view", initialTab?: ProfileViewTab) =>
            setState({ mode: "profile", jdId, profile, action, initialTab }),
        [],
    );
    const openResume = useCallback((candidateId: string, candidateName?: string) =>
        setState({ mode: "resume", candidateId, candidateName }), []);
    const close = useCallback(() => setState({ mode: "closed" }), []);
    const patchProfile = useCallback((next: any) => {
        setState(prev => prev.mode === "profile" ? { ...prev, profile: next } : prev);
    }, []);
    const notifyProfileChanged = useCallback(() => setProfileChangeCounter(v => v + 1), []);

    const value = useMemo<SideDrawerCtxValue>(() => ({
        state,
        isOpen: state.mode !== "closed",
        openJd, openProfile, openResume, close,
        patchProfile, profileChangeCounter, notifyProfileChanged,
    }), [state, openJd, openProfile, openResume, close, patchProfile, profileChangeCounter, notifyProfileChanged]);

    return <SideDrawerCtx.Provider value={value}>{children}</SideDrawerCtx.Provider>;
}

export function useSideDrawer() {
    const ctx = useContext(SideDrawerCtx);
    if (!ctx) throw new Error("useSideDrawer must be used within SideDrawerProvider");
    return ctx;
}
