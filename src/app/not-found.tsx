"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Unknown routes redirect home, matching the old <Route path="*"> catch-all.
export default function NotFound() {
    const router = useRouter();
    useEffect(() => {
        router.replace("/");
    }, [router]);
    return null;
}
