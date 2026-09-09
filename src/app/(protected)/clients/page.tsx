"use client";

import { clientPage } from "@/lib/clientPage";
import ProtectedRoute from "@/components/ProtectedRoute";

const Clients = clientPage(() => import("@/views/Clients"));

export default function ClientsPage() {
    return (
        <ProtectedRoute adminOnly>
            <Clients />
        </ProtectedRoute>
    );
}
