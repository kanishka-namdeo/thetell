"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus } from "lucide-react";

interface CompanyFormProps {
  initialData?: {
    name: string;
    slug: string;
    ticker?: string;
    description?: string;
    websiteUrl?: string;
    industry?: string;
    sector?: string;
  };
  mode: "create" | "edit";
}

export function CompanyForm({ initialData, mode }: CompanyFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  const [name, setName] = useState(initialData?.name || "");
  const [slug, setSlug] = useState(initialData?.slug || "");
  const [ticker, setTicker] = useState(initialData?.ticker || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [websiteUrl, setWebsiteUrl] = useState(initialData?.websiteUrl || "");
  const [industry, setIndustry] = useState(initialData?.industry || "");
  const [sector, setSector] = useState(initialData?.sector || "");

  function generateSlug(name: string) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function handleNameChange(value: string) {
    setName(value);
    if (mode === "create" && !slugManuallyEdited) {
      setSlug(generateSlug(value));
    }
  }

  function handleSlugChange(value: string) {
    setSlug(value);
    setSlugManuallyEdited(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name || !slug) {
      setError("Name and slug are required.");
      return;
    }

    setSubmitting(true);

    try {
      const endpoint = mode === "create" ? "/api/v1/companies" : "/api/v1/companies";
      const method = mode === "create" ? "POST" : "PATCH";

      const payload: Record<string, string> = { name, slug };
      if (ticker) payload.ticker = ticker;
      if (description) payload.description = description;
      if (websiteUrl) payload.websiteUrl = websiteUrl;
      if (industry) payload.industry = industry;
      if (sector) payload.sector = sector;

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: "Failed to save company" }));
        throw new Error(data.message || `HTTP ${res.status}`);
      }

      const company = await res.json();
      const discoveryParam = mode === "create" ? "?discovery=queued" : "";
      router.push(`/dashboard/companies/${company.id}${discoveryParam}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="border-2 border-destructive bg-destructive/5 p-4">
          <p className="text-sm text-destructive font-body">{error}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Company Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Company Name</Label>
            <Input
              id="name"
              placeholder="Acme Corporation"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              placeholder="acme-corporation"
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground font-body">
              URL-friendly identifier. Auto-generated from name if left empty.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ticker">Ticker Symbol (optional)</Label>
            <Input
              id="ticker"
              placeholder="ACME"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              maxLength={10}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Additional Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              placeholder="Brief description of the company..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="websiteUrl">Website URL (optional)</Label>
            <Input
              id="websiteUrl"
              type="url"
              placeholder="https://example.com"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="industry">Industry (optional)</Label>
            <Input
              id="industry"
              placeholder="Biotechnology, Fintech, E-commerce..."
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sector">Sector (optional)</Label>
            <Select
              value={sector}
              onValueChange={(value) => setSector(value || "")}
            >
              <SelectTrigger id="sector">
                <SelectValue placeholder="Select a sector" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Technology">Technology</SelectItem>
                <SelectItem value="Healthcare">Healthcare</SelectItem>
                <SelectItem value="Finance">Finance</SelectItem>
                <SelectItem value="Consumer">Consumer</SelectItem>
                <SelectItem value="Energy">Energy</SelectItem>
                <SelectItem value="Industrial">Industrial</SelectItem>
                <SelectItem value="Materials">Materials</SelectItem>
                <SelectItem value="Utilities">Utilities</SelectItem>
                <SelectItem value="Real Estate">Real Estate</SelectItem>
                <SelectItem value="Communication Services">Communication Services</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {mode === "create" ? "Creating..." : "Saving..."}
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-2" />
              {mode === "create" ? "Add Company" : "Save Changes"}
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={submitting}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
