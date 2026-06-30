import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import { ArrowLeft, Calendar, User } from "lucide-react";
import { SafeMarkdown } from "@/components/dashboard/safe-markdown";

export const dynamic = "force-dynamic";

interface ArticleDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ArticleDetailPage({ params }: ArticleDetailPageProps) {
  const { id } = await params;
  const article = await prisma.article.findUnique({
    where: { id },
    include: {
      company: true,
      author: {
        select: { name: true, email: true },
      },
    },
  });

  if (!article) {
    notFound();
  }

  const formatDate = (date: Date | null) => {
    if (!date) return "Not published";
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link href="/dashboard/articles">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-3 w-3 mr-1" />
            Back to Articles
          </Button>
        </Link>
      </div>

      {/* Article Header */}
      <div className="border-b-2 border-foreground pb-6">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Badge variant={article.status === "PUBLISHED" ? "default" : "outline"}>
            {article.status}
          </Badge>
          <Link href={`/dashboard/companies/${article.company.id}`}>
            <Badge variant="outline" className="cursor-pointer hover:bg-muted">
              {article.company.name}
              {article.company.ticker && ` (${article.company.ticker})`}
            </Badge>
          </Link>
        </div>

        <h1 className="text-3xl lg:text-4xl font-serif font-bold leading-tight">
          {article.title}
        </h1>

        <div className="flex flex-wrap items-center gap-4 mt-4 text-xs font-mono text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(article.publishedAt)}
          </div>
          {article.author?.name && (
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {article.author.name}
            </div>
          )}
        </div>

        <Separator className="mt-6" />

        {/* Summary */}
        <div className="mt-6 border-l-2 border-foreground pl-4">
          <p className="text-sm font-body text-muted-foreground italic leading-relaxed">
            {article.summary}
          </p>
        </div>
      </div>

      {/* Article Body */}
      <Card>
        <CardContent className="pt-6">
          <SafeMarkdown content={article.body} />
        </CardContent>
      </Card>

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Article Metadata</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-xs font-mono">
            <div>
              <p className="text-muted-foreground mb-1">Created</p>
              <p>{formatDate(article.createdAt)}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Last Updated</p>
              <p>{formatDate(article.updatedAt)}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Slug</p>
              <p className="break-all">{article.slug}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">Company</p>
              <Link
                href={`/dashboard/companies/${article.company.id}`}
                className="hover:underline"
              >
                {article.company.name}
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
