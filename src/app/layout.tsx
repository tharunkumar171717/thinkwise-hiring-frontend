import type { Metadata, Viewport } from "next";
import "../index.css";
import "../App.css";
import AppShell from "./app-shell";

export const metadata: Metadata = {
    title: "Thinkwise Hiring Desk",
    description:
        "Thinkwise Hiring Desk - A submission-centric hiring workspace for staffing and recruiting teams.",
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>
                {/* Same Google Fonts setup as the original index.html; React hoists these to <head> */}
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link
                    href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&display=swap"
                    rel="stylesheet"
                />
                {/* Thinkwise marketing pages (landing + auth) typefaces */}
                <link
                    href="https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Instrument+Serif:ital@0;1&display=swap"
                    rel="stylesheet"
                />
                <AppShell>{children}</AppShell>
            </body>
        </html>
    );
}
