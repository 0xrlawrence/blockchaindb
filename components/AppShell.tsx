"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";

/**
 * Routes get the dashboard chrome (sidebar + navbar); the landing page at "/"
 * renders bare so the scroll-world engine owns the whole viewport, and
 * "/dashboard" renders bare as a unified single page with its own navigation.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/" || pathname === "/dashboard") return <>{children}</>;

  return (
    <div className="app-shell flex min-h-screen bg-base text-ink">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
