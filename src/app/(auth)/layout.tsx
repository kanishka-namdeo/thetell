import { cn } from "@/lib/utils";
import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-h-screen flex flex-col items-center justify-center bg-background py-8")}>
      <main className="w-full flex items-center justify-center flex-1">
        {children}
      </main>
      <footer className="mt-8 text-center text-sm text-muted-foreground">
        <p>
          Don&apos;t have an account?{" "}
          <Link
            href="/sign-up"
            className="text-foreground font-medium underline underline-offset-4 hover:text-foreground/80"
          >
            Sign up
          </Link>
        </p>
        <p className="mt-2">
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="text-foreground font-medium underline underline-offset-4 hover:text-foreground/80"
          >
            Sign in
          </Link>
        </p>
      </footer>
    </div>
  );
}
