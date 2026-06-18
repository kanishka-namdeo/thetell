import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { Container, Section, Headline, Badge, Metadata } from "@/components";
import { SafeMarkdown } from "@/components/dashboard/safe-markdown";
import { SignupPrompt } from "../../_components/signup-prompt";
import { ShareButton } from "@/components/dashboard/share-button";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

interface ArticleDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ArticleDetailPage({ params }: ArticleDetailPageProps) {
  const { id } = await params;

  const article = await prisma.article.findUnique({
    where: { id },
    include: { company: true },
  });

  if (!article || article.status !== "PUBLISHED") {
    notFound();
  }

  // Fetch the first analysis to get the signalId
  const analysisIds = Array.isArray(article.analysisIds) ? article.analysisIds : [];
  const firstAnalysis = analysisIds.length > 0
    ? await prisma.analysis.findUnique({
        where: { id: analysisIds[0] as string },
        select: { signalId: true },
      })
    : null;

  const publishedDate = article.publishedAt
    ? new Date(article.publishedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <Section>
      <Container className="max-w-3xl">
        {/* Back Link */}
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" />
          Back to Feed
        </Link>

        {/* Article Header */}
        <div className="border-b-4 border-foreground pb-6 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Link href={`/companies/${article.company.id}`}>
              <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                {article.company.name}
              </Badge>
            </Link>
            <Badge
              variant={article.agentPersona === "ANALYST" ? "default" : "accent"}
            >
              {article.agentPersona === "ANALYST" ? "The Analyst" : "Gossip Girl"}
            </Badge>
          </div>
          <Headline level={1} size="hero" className="mb-4">
            {article.title}
          </Headline>
          <div className="flex flex-wrap items-center gap-3">
            {publishedDate && <Metadata>{publishedDate}</Metadata>}
            {firstAnalysis && (
              <Link
                href={`/signals/${firstAnalysis.signalId}`}
                className="inline-flex items-center gap-1 text-sm text-foreground hover:text-muted-foreground transition-colors"
              >
                View Source Signal
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
            <div className="ml-auto">
              <ShareButton />
            </div>
          </div>
        </div>

        {/* Article Content */}
        <div className="prose prose-neutral max-w-none">
          <SafeMarkdown content={article.body} />
        </div>

        {/* Signup Prompt */}
        <SignupPrompt />
      </Container>
    </Section>
  );
}
