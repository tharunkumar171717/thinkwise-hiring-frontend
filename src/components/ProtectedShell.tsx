import type { ReactNode } from "react";
import ProtectedRoute from "./ProtectedRoute";
import DashboardLayout from "./DashboardLayout";

// Composes the auth guard + sidebar layout that used to wrap the protected
// react-router routes in App.tsx.
export default function ProtectedShell({ children }: { children: ReactNode }) {
    return (
        <ProtectedRoute>
            <DashboardLayout>{children}</DashboardLayout>
        </ProtectedRoute>
    );
}
