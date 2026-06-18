import { Card, CardContent, Button, Headline, Body, Metadata } from "@/components";
import Link from "next/link";

export function SignupPrompt() {
  return (
    <Card className="border-2 border-foreground my-8">
      <CardContent className="pt-6 text-center">
        <Headline level={3} size="card" className="mb-3">
          Want alerts when something big happens?
        </Headline>
        <Body className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
          Create a free account to track companies, set confidence thresholds, and get notified of strategic shifts.
        </Body>
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          <Link href="/sign-up">
            <Button>Create Account</Button>
          </Link>
          <Link href="/sign-in">
            <Metadata className="hover:text-foreground cursor-pointer transition-colors">
              Already have an account? Sign in
            </Metadata>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
