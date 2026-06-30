import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar, MessageSquare } from "lucide-react";

interface SharedSessionPageProps {
  params: Promise<{ token: string }>;
}

export default async function SharedSessionPage({ params }: SharedSessionPageProps) {
  const { token } = await params;

  const share = await prisma.deepAgentShare.findUnique({
    where: { token },
    include: {
      session: {
        include: {
          messages: {
            orderBy: { timestamp: "asc" },
          },
        },
      },
    },
  });

  if (!share) {
    notFound();
  }

  if (share.revokedAt || share.expiresAt < new Date()) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md p-8 text-center">
          <h1 className="text-2xl font-bold mb-2">Link Expired</h1>
          <p className="text-muted-foreground">
            This shared conversation link has expired or been revoked.
          </p>
        </Card>
      </div>
    );
  }

  const { session } = share;
  const messages = session.messages;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="container max-w-4xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold mb-2">{session.title}</h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {new Date(session.createdAt).toLocaleDateString()}
            </div>
            <div className="flex items-center gap-1">
              <MessageSquare className="h-4 w-4" />
              {messages.length} messages
            </div>
            <Badge variant="outline">Shared</Badge>
          </div>
        </div>
      </div>

      <div className="container max-w-4xl mx-auto px-4 py-6">
        <ScrollArea className="h-[calc(100vh-200px)]">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.role === "user"
                    ? "flex justify-end"
                    : "flex justify-start"
                }
              >
                <Card
                  className={
                    message.role === "user"
                      ? "max-w-[80%] bg-primary text-primary-foreground"
                      : "max-w-[80%] bg-card"
                  }
                >
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge
                        variant={message.role === "user" ? "secondary" : "outline"}
                        className="text-xs"
                      >
                        {message.role === "user" ? "You" : "DeepAgent"}
                      </Badge>
                      <span className="text-xs opacity-70">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap text-sm">
                      {message.content || "Processing..."}
                    </div>
                  </div>
                </Card>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
