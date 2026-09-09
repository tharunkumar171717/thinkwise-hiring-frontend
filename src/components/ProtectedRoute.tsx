import { Navigate } from "../lib/router";
import { useAuth } from "../context/AuthContext";
import type { ReactNode } from "react";

interface Props {
    children: ReactNode;
    adminOnly?: boolean;
}

export default function ProtectedRoute({ children, adminOnly = false }: Props) {
    const { user, isAdmin, loading } = useAuth();

    if (loading) return null;

    if (!user) return <Navigate to="/?login=1" replace />;

    if (adminOnly && !isAdmin) {
        return <Navigate to="/dashboard" replace />;
    }

    return <>{children}</>;
}
