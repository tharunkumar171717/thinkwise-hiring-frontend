"use client";

/**
 * react-router-dom compatibility layer over next/navigation.
 *
 * The app was originally a Vite + react-router SPA. To keep every page and
 * component behaviorally identical after the Next.js migration, this module
 * re-implements the exact react-router API surface the codebase uses
 * (Link, NavLink, Navigate, useNavigate, useParams, useSearchParams,
 * useLocation) on top of the Next.js App Router.
 */

import NextLink from "next/link";
import {
    useRouter,
    usePathname,
    useParams as useNextParams,
    useSearchParams as useNextSearchParams,
} from "next/navigation";
import { useEffect, type ReactNode, type AnchorHTMLAttributes, type CSSProperties } from "react";

/* ── navigation state (react-router's location.state) ─────────────────────
 * next/navigation has no state channel, so we stash it in sessionStorage
 * keyed to the destination path, mirroring how react-router state survives
 * a reload of the same location but not navigation elsewhere. */
const STATE_KEY = "__rr_nav_state";

function setNavState(path: string, state: unknown) {
    try {
        if (state === undefined || state === null) {
            sessionStorage.removeItem(STATE_KEY);
        } else {
            sessionStorage.setItem(STATE_KEY, JSON.stringify({ path: path.split("?")[0], state }));
        }
    } catch { /* private mode etc. - state just won't persist */ }
}

function getNavState(currentPath: string): unknown {
    try {
        const raw = sessionStorage.getItem(STATE_KEY);
        if (!raw) return null;
        const { path, state } = JSON.parse(raw);
        return path === currentPath ? state : null;
    } catch {
        return null;
    }
}

/* ── useNavigate ── */
interface NavigateOptions {
    replace?: boolean;
    state?: unknown;
}

export function useNavigate() {
    const router = useRouter();
    return (to: string | number, options?: NavigateOptions) => {
        if (typeof to === "number") {
            if (to < 0) for (let i = 0; i < -to; i++) router.back();
            else for (let i = 0; i < to; i++) router.forward();
            return;
        }
        if (options && "state" in options) setNavState(to, options.state);
        if (options?.replace) router.replace(to);
        else router.push(to);
    };
}

/* ── useParams ── */
export function useParams<T extends Record<string, string | undefined> = Record<string, string | undefined>>(): T {
    const params = useNextParams();
    const out: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(params ?? {})) {
        const val = Array.isArray(v) ? v.join("/") : v;
        out[k] = typeof val === "string" ? decodeURIComponent(val) : val;
    }
    return out as T;
}

/* ── useSearchParams ── */
type SetSearchParams = (
    next: URLSearchParams | Record<string, string> | string,
    opts?: { replace?: boolean }
) => void;

export function useSearchParams(): [URLSearchParams, SetSearchParams] {
    const nextParams = useNextSearchParams();
    const pathname = usePathname();
    const router = useRouter();

    const params = new URLSearchParams(nextParams?.toString() ?? "");

    const setSearchParams: SetSearchParams = (next, opts) => {
        const sp = next instanceof URLSearchParams ? next : new URLSearchParams(next);
        const qs = sp.toString();
        const path = pathname ?? window.location.pathname;
        const url = qs ? `${path}?${qs}` : path;
        if (opts?.replace) router.replace(url, { scroll: false });
        else router.push(url, { scroll: false });
    };

    return [params, setSearchParams];
}

/* ── useLocation ── */
export function useLocation() {
    const pathname = usePathname() ?? "/";
    const nextParams = useNextSearchParams();
    const search = nextParams?.toString() ? `?${nextParams.toString()}` : "";
    return {
        pathname,
        search,
        hash: typeof window !== "undefined" ? window.location.hash : "",
        state: getNavState(pathname),
        key: "",
    };
}

/* ── <Navigate> ── */
export function Navigate({ to, replace = false, state }: { to: string; replace?: boolean; state?: unknown }) {
    const router = useRouter();
    useEffect(() => {
        if (state !== undefined) setNavState(to, state);
        if (replace) router.replace(to);
        else router.push(to);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [to, replace]);
    return null;
}

/* ── <Link> ── */
interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
    to: string;
    replace?: boolean;
    state?: unknown;
    children?: ReactNode;
}

export function Link({ to, replace, state, onClick, children, ...rest }: LinkProps) {
    return (
        <NextLink
            href={to}
            replace={replace}
            onClick={(e) => {
                if (state !== undefined) setNavState(to, state);
                onClick?.(e);
            }}
            {...rest}
        >
            {children}
        </NextLink>
    );
}

/* ── <NavLink> ── */
interface NavLinkRenderArgs {
    isActive: boolean;
    isPending: boolean;
}

interface NavLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className" | "style" | "children"> {
    to: string;
    end?: boolean;
    replace?: boolean;
    className?: string | ((args: NavLinkRenderArgs) => string | undefined);
    style?: CSSProperties | ((args: NavLinkRenderArgs) => CSSProperties | undefined);
    children?: ReactNode | ((args: NavLinkRenderArgs) => ReactNode);
}

export function NavLink({ to, end = false, replace, className, style, children, ...rest }: NavLinkProps) {
    const pathname = usePathname() ?? "";
    const toPath = to.split("?")[0];
    const isActive = end
        ? pathname === toPath
        : pathname === toPath || pathname.startsWith(toPath.endsWith("/") ? toPath : `${toPath}/`);

    const args: NavLinkRenderArgs = { isActive, isPending: false };

    // react-router appends " active" to a plain string className when active
    const resolvedClassName =
        typeof className === "function"
            ? className(args)
            : [className, isActive ? "active" : undefined].filter(Boolean).join(" ") || undefined;

    const resolvedStyle = typeof style === "function" ? style(args) : style;

    return (
        <NextLink href={to} replace={replace} className={resolvedClassName} style={resolvedStyle} {...rest}>
            {typeof children === "function" ? children(args) : children}
        </NextLink>
    );
}
