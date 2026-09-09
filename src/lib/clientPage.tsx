"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

/**
 * Wraps a page component so it renders client-side only (no SSR), matching
 * the original Vite SPA's runtime behavior exactly.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function clientPage<P extends object = Record<string, never>>(
    loader: () => Promise<{ default: ComponentType<P> }>
) {
    return dynamic(loader, { ssr: false });
}
