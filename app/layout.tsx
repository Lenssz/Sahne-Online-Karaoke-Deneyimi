import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import "./globals.css";
import { getViewer } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Sahne — arkadaşlarınla şarkı söyle",
  description: "Davet ettiğin arkadaşlarınla özel şarkı klibi odası.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  return (
    <html lang="tr">
      <body className="min-h-screen antialiased">
        <AppShell user={viewer ? { email: viewer.user.email ?? null, isAdmin: viewer.isAdmin } : null}>{children}</AppShell>
      </body>
    </html>
  );
}
