import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CompanyForm } from "@/components/dashboard/company-form";
import { ArrowLeft } from "lucide-react";

export default async function NewCompanyPage() {
  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/companies">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-3 w-3 mr-1" />
            Back to Companies
          </Button>
        </Link>
      </div>

      <div className="border-b-2 border-foreground pb-4">
        <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground mb-1">
          Organizations
        </p>
        <h1 className="text-3xl font-serif font-bold">Add Company</h1>
        <p className="text-sm text-muted-foreground font-body mt-1">
          Add a new company to monitor for strategic signals
        </p>
      </div>

      <div className="max-w-2xl">
        <CompanyForm mode="create" />
      </div>
    </div>
  );
}
