"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Logo } from "@/components/logo";

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const registered = searchParams.get("registered") === "true";
  const verified = searchParams.get("verified") === "true";
  const reset = searchParams.get("reset") === "true";
  const emailError = searchParams.get("error") === "EmailNotVerified";
  const isDev = process.env.NODE_ENV === "development";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        if (result.error === "EmailNotVerified") {
          setError("Please verify your email before signing in.");
        } else {
          setError("Invalid email or password");
        }
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md px-4">
      <Card>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="h-12 w-12 border-2 border-foreground flex items-center justify-center">
              <Logo className="h-6 w-6" />
            </div>
          </div>
          <CardTitle className="text-3xl font-serif">The Tell</CardTitle>
          <CardDescription>Sign in to access your dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          {registered && (
            <div className="p-3 mb-4 bg-success/10 border border-success text-success text-sm rounded-md">
              Account created successfully. Please sign in.
            </div>
          )}
          {verified && (
            <div className="p-3 mb-4 bg-success/10 border border-success text-success text-sm rounded-md">
              Email verified! You can now sign in.
            </div>
          )}
          {reset && (
            <div className="p-3 mb-4 bg-success/10 border border-success text-success text-sm rounded-md">
              Password reset! Sign in with your new password.
            </div>
          )}
          {emailError && (
            <div className="p-3 mb-4 bg-destructive/10 border border-destructive text-destructive text-sm rounded-md">
              Please verify your email before signing in.
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="admin@thetell.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive text-destructive text-sm rounded-md">
                {error}
              </div>
            )}
            <div className="space-y-3">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in..." : "Sign In"}
              </Button>
              <div className="flex justify-end">
                <Link
                  href="/forgot-password"
                  className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
                >
                  Forgot password?
                </Link>
              </div>
            </div>
          </form>
          {isDev && (
            <p className="mt-6 text-xs text-muted-foreground text-center">
              Dev: admin@thetell.com / password123
            </p>
          )}
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              href="/sign-up"
              className="text-foreground font-medium underline underline-offset-4 hover:text-foreground/80"
            >
              Sign up
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
