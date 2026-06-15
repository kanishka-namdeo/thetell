import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileQuestionMark } from "lucide-react";

export default function DashboardNotFound() {
  return (
    <div className="p-4 lg:p-6 flex items-center justify-center min-h-[400px]">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 text-center">
          <FileQuestionMark className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-serif font-bold mb-2">Page not found</h2>
          <p className="text-sm text-muted-foreground font-body mb-6">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
          <Link href="/dashboard">
            <Button variant="outline">Back to Dashboard</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
