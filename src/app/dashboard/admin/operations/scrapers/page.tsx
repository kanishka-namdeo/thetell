import { ScrapersClient } from "./scrapers-client";

export const dynamic = "force-dynamic";

export default function OperationsScrapersPage() {
  return (
    <div className="space-y-6">
      <ScrapersClient />
    </div>
  );
}
