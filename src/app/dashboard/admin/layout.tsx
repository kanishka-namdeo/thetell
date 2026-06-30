"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { isAdmin } from "@/lib/auth-guard";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (
      status === "unauthenticated" ||
      (status === "authenticated" && !isAdmin(session))
    ) {
      router.replace("/dashboard");
    }
  }, [status, session, router]);

  if (status === "loading") {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!session || !isAdmin(session)) {
    return null;
  }

  // Admin pages now render directly - the sidebar is handled by the parent dashboard layout
  return (
    <div className="flex flex-col min-h-full">
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
