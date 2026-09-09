import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { apiFetch, setTokens, clearTokens } from "../services/api";

interface User {
    id: string;
    name: string;
    email: string;
    role: string;
    is_super_admin?: boolean;
}

interface AuthContextType {
    user: User | null;
    login: (accessToken: string, refreshToken: string) => Promise<void>;
    logout: () => void;
    isAdmin: boolean;
    isRecruiter: boolean;
    isSuperAdmin: boolean;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const loadProfile = useCallback(async () => {
        try {
            const profile = await apiFetch("/auth/me");
            setUser(profile);
        } catch {
            clearTokens();
            setUser(null);
        }
    }, []);

    useEffect(() => {
        if (localStorage.getItem("token")) {
            loadProfile().finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, [loadProfile]);

    const login = async (accessToken: string, refreshToken: string) => {
        setTokens(accessToken, refreshToken);
        await loadProfile();
    };

    const logout = () => {
        clearTokens();
        setUser(null);
    };

    const isSuperAdmin = !!user?.is_super_admin;
    const isAdmin = user?.role === "ADMIN" || isSuperAdmin;
    const isRecruiter = user?.role === "RECRUITER" || isAdmin;

    return (
        <AuthContext.Provider value={{ user, login, logout, isAdmin, isRecruiter, isSuperAdmin, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within AuthProvider");
    return ctx;
};
