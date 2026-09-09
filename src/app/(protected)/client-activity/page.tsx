"use client";

import { clientPage } from "@/lib/clientPage";
import ProtectedRoute from "@/components/ProtectedRoute";

const ClientActivity = clientPage(() => import("@/views/ClientActivity"));

export default function ClientActivityPage() {
    return (
        <ProtectedRoute adminOnly>
            <ClientActivity />
        </ProtectedRoute>
    );
}
