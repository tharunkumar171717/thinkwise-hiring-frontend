export function toUtcDate(value: string | Date): Date {
    if (typeof value === "string" && !/Z|[+-]\d{2}:?\d{2}$/.test(value)) {
        return new Date(value + "Z");
    }
    return new Date(value);
}

export function fmtDate(value?: string | Date | null): string {
    if (!value) return "-";
    try {
        return toUtcDate(value).toLocaleDateString("en-IN", {
            day: "2-digit", month: "short", year: "numeric",
            timeZone: "Asia/Kolkata",
        });
    } catch { return String(value); }
}

export function fmtTs(value?: string | Date | null): string {
    if (!value) return "-";
    try {
        return toUtcDate(value).toLocaleString("en-IN", {
            day: "2-digit", month: "short", year: "numeric",
            hour: "2-digit", minute: "2-digit", hour12: true,
            timeZone: "Asia/Kolkata",
        });
    } catch { return String(value); }
}
