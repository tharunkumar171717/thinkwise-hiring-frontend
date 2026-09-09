"use client";

import { clientPage } from "@/lib/clientPage";
import ProtectedRoute from "@/components/ProtectedRoute";

const TestTools = clientPage(() => import("@/views/TestTools"));

export default function TestToolsPage() {
    return (
        <ProtectedRoute adminOnly>
            <TestTools />
        </ProtectedRoute>
    );
}
