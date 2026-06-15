import {
  Container,
  Section,
  Headline,
  Label,
  Body,
  Metadata,
  Ornament,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  Input,
  Separator,
  Icon,
  Newspaper,
  TrendingUp,
  BarChart3,
  ArrowRight,
  Star,
  Bookmark,
  ExternalLink,
} from "@/components";

export default function Home() {
  return (
    <main className="flex-1">
      {/* Header */}
      <header className="border-b-4 border-foreground bg-background">
        <Container className="py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Icon icon={Newspaper} size="lg" bordered />
              <div>
                <Headline level={1} size="subheading" className="text-3xl">
                  THE TELL
                </Headline>
                <Metadata>Vol. 1 | June 14, 2026 | Digital Edition</Metadata>
              </div>
            </div>
            <nav className="hidden md:flex items-center gap-6">
              <Label className="hover:text-accent cursor-pointer transition-colors">
                Analysis
              </Label>
              <Label className="hover:text-accent cursor-pointer transition-colors">
                Signals
              </Label>
              <Label className="hover:text-accent cursor-pointer transition-colors">
                Reports
              </Label>
              <Button size="sm">Subscribe</Button>
            </nav>
          </div>
        </Container>
      </header>

      {/* Hero Section */}
      <Section className="border-b-4 border-foreground">
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8">
              <Badge variant="accent" className="mb-4">
                Breaking Analysis
              </Badge>
              <Headline level={1} size="hero" className="mb-6">
                Decoding Corporate Signals Through AI
              </Headline>
              <Body className="text-lg mb-6" dropCap>
                In an era of unprecedented corporate transparency, artificial intelligence emerges as the ultimate decoder of public signals. From earnings calls to social media posts, every corporate communication carries hidden meanings waiting to be uncovered.
              </Body>
              <Body className="text-base text-neutral-600 mb-8">
                Our system analyzes thousands of data points daily, identifying patterns that reveal the inner workings of organizations before they become public knowledge.
              </Body>
              <div className="flex flex-wrap gap-4">
                <Button size="lg">
                  Read Full Analysis
                  <Icon icon={ArrowRight} size="sm" className="ml-2" />
                </Button>
                <Button variant="secondary" size="lg">
                  View Methodology
                </Button>
              </div>
            </div>
            <div className="lg:col-span-4 border-l-4 border-foreground pl-8">
              <Metadata className="mb-4">Key Metrics</Metadata>
              <div className="space-y-6">
                <div>
                  <Label className="text-neutral-500">Signals Analyzed</Label>
                  <Headline level={2} size="card" className="text-4xl mt-1">
                    12,847
                  </Headline>
                </div>
                <Separator />
                <div>
                  <Label className="text-neutral-500">Accuracy Rate</Label>
                  <Headline level={2} size="card" className="text-4xl mt-1">
                    94.3%
                  </Headline>
                </div>
                <Separator />
                <div>
                  <Label className="text-neutral-500">Companies Tracked</Label>
                  <Headline level={2} size="card" className="text-4xl mt-1">
                    2,156
                  </Headline>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* Features Grid */}
      <Section texture>
        <Container>
          <div className="mb-12">
            <Label className="mb-2">Core Capabilities</Label>
            <Headline level={2} size="section">
              What We Analyze
            </Headline>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 border-t border-l border-foreground">
            {[
              {
                icon: TrendingUp,
                title: "Market Signals",
                description:
                  "Real-time analysis of stock movements, trading volumes, and market sentiment to predict corporate strategies.",
              },
              {
                icon: BarChart3,
                title: "Financial Reports",
                description:
                  "Deep parsing of earnings calls, 10-K filings, and financial statements to extract hidden narratives.",
              },
              {
                icon: Star,
                title: "Executive Communications",
                description:
                  "Linguistic analysis of CEO letters, interviews, and public statements to gauge confidence and direction.",
              },
            ].map((feature, idx) => (
              <div
                key={idx}
                className="border-r border-b border-foreground p-8 bg-background hover:bg-neutral-100 transition-colors duration-200"
              >
                <Icon
                  icon={feature.icon}
                  size="lg"
                  bordered
                  interactive
                  className="mb-6"
                />
                <Headline level={3} size="card" className="mb-3">
                  {feature.title}
                </Headline>
                <Body className="text-sm text-neutral-600">
                  {feature.description}
                </Body>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      {/* Cards Section */}
      <Section className="border-b-4 border-foreground">
        <Container>
          <Ornament />
          <div className="mb-12 text-center">
            <Label className="mb-2">Latest Reports</Label>
            <Headline level={2} size="section">
              Featured Analysis
            </Headline>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                category: "Technology",
                title: "The AI Arms Race: What Silicon Valley Isn't Saying",
                date: "June 12, 2026",
                readTime: "8 min read",
              },
              {
                category: "Finance",
                title: "Banking Sector Signals: A Quiet Revolution",
                date: "June 10, 2026",
                readTime: "6 min read",
              },
              {
                category: "Healthcare",
                title: "Pharma Pipelines: Reading Between the Lines",
                date: "June 8, 2026",
                readTime: "10 min read",
              },
            ].map((article, idx) => (
              <Card key={idx} className="hard-shadow-hover">
                <CardHeader>
                  <Badge variant="outline" className="mb-3 w-fit">
                    {article.category}
                  </Badge>
                  <CardTitle>{article.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-xs">
                    <Metadata>{article.date}</Metadata>
                    <Metadata>•</Metadata>
                    <Metadata>{article.readTime}</Metadata>
                  </div>
                </CardContent>
                <CardFooter className="gap-3">
                  <Button variant="ghost" size="icon" aria-label="Bookmark">
                    <Icon icon={Bookmark} size="sm" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Share">
                    <Icon icon={ExternalLink} size="sm" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      {/* Inverted Section */}
      <Section inverted>
        <Container>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <Badge variant="muted" className="mb-4">
                Methodology
              </Badge>
              <Headline level={2} size="section" className="text-background mb-6">
                How We Decode the Signals
              </Headline>
              <Body className="text-neutral-400 mb-6">
                Our proprietary AI system processes millions of data points daily, using advanced natural language processing and pattern recognition to identify corporate signals that human analysts miss.
              </Body>
              <div className="space-y-4">
                {[
                  "Natural Language Processing",
                  "Pattern Recognition Algorithms",
                  "Real-time Signal Detection",
                  "Predictive Analytics",
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="h-8 w-8 border border-background flex items-center justify-center text-background font-mono text-sm">
                      {String(idx + 1).padStart(2, "0")}
                    </div>
                    <Label className="text-background">{item}</Label>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-4 border-background p-8">
              <Metadata className="text-neutral-400 mb-4">
                System Performance
              </Metadata>
              <div className="space-y-6">
                {[
                  { label: "Signal Detection", value: "98.7%" },
                  { label: "Pattern Accuracy", value: "94.3%" },
                  { label: "Prediction Success", value: "89.2%" },
                ].map((stat, idx) => (
                  <div key={idx}>
                    <div className="flex justify-between mb-2">
                      <Label className="text-background">{stat.label}</Label>
                      <Headline
                        level={3}
                        size="subheading"
                        className="text-accent"
                      >
                        {stat.value}
                      </Headline>
                    </div>
                    <div className="h-2 bg-neutral-700">
                      <div
                        className="h-full bg-accent"
                        style={{ width: stat.value }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* Newsletter Section */}
      <Section className="border-b-4 border-foreground">
        <Container>
          <div className="max-w-2xl mx-auto text-center">
            <Headline level={2} size="section" className="mb-4">
              Stay Informed
            </Headline>
            <Body className="text-neutral-600 mb-8">
              Subscribe to our daily briefing and receive the most critical corporate signals analysis directly in your inbox.
            </Body>
            <div className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
              <Input
                type="email"
                placeholder="your@email.com"
                className="flex-1"
              />
              <Button>Subscribe</Button>
            </div>
            <Metadata className="mt-4">
              Join 12,000+ professionals. No spam, unsubscribe anytime.
            </Metadata>
          </div>
        </Container>
      </Section>

      {/* Footer */}
      <footer className="bg-background">
        <Container className="py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div className="col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <Icon icon={Newspaper} size="md" bordered />
                <Headline level={3} size="subheading" className="text-xl">
                  THE TELL
                </Headline>
              </div>
              <Body className="text-sm text-neutral-600 max-w-sm">
                Decoding corporate signals through artificial intelligence. All the news that's fit to analyze.
              </Body>
            </div>
            <div>
              <Label className="mb-4">Product</Label>
              <nav className="flex flex-col gap-2">
                <Label className="text-neutral-600 hover:text-foreground cursor-pointer transition-colors">
                  Features
                </Label>
                <Label className="text-neutral-600 hover:text-foreground cursor-pointer transition-colors">
                  Pricing
                </Label>
                <Label className="text-neutral-600 hover:text-foreground cursor-pointer transition-colors">
                  API
                </Label>
              </nav>
            </div>
            <div>
              <Label className="mb-4">Company</Label>
              <nav className="flex flex-col gap-2">
                <Label className="text-neutral-600 hover:text-foreground cursor-pointer transition-colors">
                  About
                </Label>
                <Label className="text-neutral-600 hover:text-foreground cursor-pointer transition-colors">
                  Blog
                </Label>
                <Label className="text-neutral-600 hover:text-foreground cursor-pointer transition-colors">
                  Contact
                </Label>
              </nav>
            </div>
          </div>
          <Separator weight="heavy" className="mb-8" />
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <Metadata>
              © 2026 The Tell. Edition: Vol 1.0 | Printed in NYC
            </Metadata>
            <div className="flex gap-4">
              <Button variant="ghost" size="icon" aria-label="Twitter">
                <Icon icon={Star} size="sm" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="LinkedIn">
                <Icon icon={Bookmark} size="sm" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="GitHub">
                <Icon icon={ExternalLink} size="sm" />
              </Button>
            </div>
          </div>
        </Container>
      </footer>
    </main>
  );
}
