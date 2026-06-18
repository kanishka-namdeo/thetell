import { PrismaClient, SourceType, Sentiment, SignalStatus, Role } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  const passwordHash = await bcrypt.hash("password123", 10);

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@thetell.com" },
    update: {},
    create: {
      email: "admin@thetell.com",
      name: "Admin User",
      passwordHash,
      role: Role.ADMIN,
      emailVerified: new Date(),
    },
  });

  await prisma.user.upsert({
    where: { email: "analyst@thetell.com" },
    update: {},
    create: {
      email: "analyst@thetell.com",
      name: "Test Analyst",
      passwordHash,
      role: Role.USER,
      emailVerified: new Date(),
    },
  });

  const companies = [
    {
      name: "Apple Inc.",
      slug: "apple",
      ticker: "AAPL",
      description:
        "Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories worldwide.",
      websiteUrl: "https://www.apple.com",
    },
    {
      name: "Tesla, Inc.",
      slug: "tesla",
      ticker: "TSLA",
      description:
        "Tesla, Inc. designs, develops, manufactures, leases, and sells electric vehicles, and energy generation and storage systems.",
      websiteUrl: "https://www.tesla.com",
    },
    {
      name: "NVIDIA Corporation",
      slug: "nvidia",
      ticker: "NVDA",
      description:
        "NVIDIA Corporation, a computing infrastructure company, provides graphics and compute and networking solutions in the United States, Singapore, Taiwan, China, Hong Kong, and internationally.",
      websiteUrl: "https://www.nvidia.com",
    },
  ];

  for (const company of companies) {
    await prisma.company.upsert({
      where: { slug: company.slug },
      update: {},
      create: company,
    });
  }

  const apple = await prisma.company.findUnique({ where: { slug: "apple" } });
  const tesla = await prisma.company.findUnique({ where: { slug: "tesla" } });
  const nvidia = await prisma.company.findUnique({ where: { slug: "nvidia" } });

  if (!apple || !tesla || !nvidia) {
    throw new Error("Companies not found");
  }

  const signals = [
    {
      title: "Apple Reports Record Q4 Revenue Amid Strong iPhone Sales",
      sourceUrl: "https://example.com/apple-q4-revenue",
      sourceType: SourceType.NEWS,
      rawContent:
        "Apple Inc. reported record fourth-quarter revenue of $94.9 billion, driven by stronger-than-expected iPhone 15 sales. The company's services segment also reached an all-time high of $22.3 billion. CEO Tim Cook attributed the results to 'unprecedented demand across all product lines' and highlighted the company's growing installed base of over 2.2 billion active devices. Analysts noted the resilience of Apple's ecosystem despite broader economic headwinds.",
      publishedAt: new Date("2026-06-10"),
      companyId: apple.id,
      status: SignalStatus.ANALYZED,
    },
    {
      title: "Apple Expands AI Investment with New Machine Learning Division",
      sourceUrl: "https://example.com/apple-ai-division",
      sourceType: SourceType.NEWS,
      rawContent:
        "Apple is establishing a new machine learning division focused on on-device AI capabilities, according to internal memos reviewed by Reuters. The division will be led by John Giannandrea, Apple's senior vice president of Machine Learning and AI Strategy. The move signals Apple's intent to reduce reliance on cloud-based AI services and accelerate its competitive position in the generative AI race.",
      publishedAt: new Date("2026-06-08"),
      companyId: apple.id,
      status: SignalStatus.ANALYZED,
    },
    {
      title: "Apple Vision Pro 2 Development Timeline Leaked",
      sourceUrl: "https://example.com/apple-vision-pro-2",
      sourceType: SourceType.SOCIAL,
      rawContent:
        "Supply chain sources indicate Apple has accelerated development of Vision Pro 2, targeting a Q1 2027 launch. The new headset is expected to be 40% lighter and feature a more affordable price point around $2,000. Apple is reportedly working with Samsung on next-generation micro-OLED displays.",
      publishedAt: new Date("2026-06-05"),
      companyId: apple.id,
      status: SignalStatus.ANALYZED,
    },
    {
      title: "Apple Services Revenue Crosses $22B Quarterly Milestone",
      sourceUrl: "https://example.com/apple-services",
      sourceType: SourceType.FILING,
      rawContent:
        "In its latest 10-Q filing, Apple disclosed that services revenue reached $22.3 billion in Q4, representing 18% year-over-year growth. The filing highlighted strong performance from Apple TV+, Apple Music, and the App Store. Gross margins for services improved to 73.7%, up from 70.8% a year ago.",
      publishedAt: new Date("2026-06-03"),
      companyId: apple.id,
      status: SignalStatus.ANALYZED,
    },
    {
      title: "Apple Hiring Freeze in Hardware Division Raises Eyebrows",
      sourceUrl: "https://example.com/apple-hiring-freeze",
      sourceType: SourceType.JOB_POSTING,
      rawContent:
        "Apple has implemented a hiring freeze across its hardware engineering division, affecting at least 12 open positions listed on its careers page. The freeze does not affect software or AI roles. Industry observers see this as a potential signal of cost optimization ahead of an economic slowdown.",
      publishedAt: new Date("2026-06-01"),
      companyId: apple.id,
      status: SignalStatus.ANALYZED,
    },
    {
      title: "Tesla Opens New Gigafactory in Indonesia",
      sourceUrl: "https://example.com/tesla-indonesia",
      sourceType: SourceType.NEWS,
      rawContent:
        "Tesla officially opened its new Gigafactory in Jakarta, Indonesia, with a planned annual production capacity of 500,000 vehicles. CEO Elon Musk attended the inauguration ceremony, calling it 'a pivotal moment for Tesla's Southeast Asian expansion.' The facility will primarily produce the next-generation Model 2, targeting the sub-$25,000 EV market.",
      publishedAt: new Date("2026-06-12"),
      companyId: tesla.id,
      status: SignalStatus.ANALYZED,
    },
    {
      title: "Tesla FSD v13 Receives Regulatory Approval in EU",
      sourceUrl: "https://example.com/tesla-fsd-eu",
      sourceType: SourceType.NEWS,
      rawContent:
        "Tesla's Full Self-Driving v13 has received regulatory approval from the European Union's automotive safety authority, making it the first Level 3 autonomous system approved for use on European roads. The approval covers highway driving scenarios and requires the driver to remain attentive. Tesla plans to roll out the feature via OTA update starting next month.",
      publishedAt: new Date("2026-06-09"),
      companyId: tesla.id,
      status: SignalStatus.ANALYZED,
    },
    {
      title: "Tesla Energy Storage Deployments Surge 152% YoY",
      sourceUrl: "https://example.com/tesla-energy",
      sourceType: SourceType.FILING,
      rawContent:
        "Tesla's energy generation and storage segment reported a 152% year-over-year increase in deployments, reaching 9.2 GWh in Q4. The Megapack product line accounted for 85% of deployments. CEO Elon Musk noted that energy storage is 'on track to become a business as large as automotive' within five years.",
      publishedAt: new Date("2026-06-06"),
      companyId: tesla.id,
      status: SignalStatus.ANALYZED,
    },
    {
      title: "Tesla Robotaxi Pilot Launches in Austin",
      sourceUrl: "https://example.com/tesla-robotaxi",
      sourceType: SourceType.NEWS,
      rawContent:
        "Tesla launched a limited robotaxi pilot program in Austin, Texas, with a fleet of 50 autonomous Model Y vehicles. The service operates in a geofenced area covering downtown Austin and the airport corridor. Initial rides are free and available to invited testers through the Tesla app.",
      publishedAt: new Date("2026-06-04"),
      companyId: tesla.id,
      status: SignalStatus.ANALYZED,
    },
    {
      title: "Tesla CFO Signals Potential Price Cuts for Model Y",
      sourceUrl: "https://example.com/tesla-price-cuts",
      sourceType: SourceType.TRANSCRIPT,
      rawContent:
        "During the Q4 earnings call, Tesla CFO Vaibhav Taneja indicated the company is 'evaluating pricing adjustments' for the Model Y lineup in response to increased competition. 'We want to ensure our products remain accessible to the widest possible audience,' Taneja said. Analysts interpreted the comments as signaling potential 5-10% price reductions.",
      publishedAt: new Date("2026-06-02"),
      companyId: tesla.id,
      status: SignalStatus.ANALYZED,
    },
    {
      title: "NVIDIA Reports 262% Revenue Growth on AI Chip Demand",
      sourceUrl: "https://example.com/nvidia-revenue",
      sourceType: SourceType.NEWS,
      rawContent:
        "NVIDIA Corporation reported a staggering 262% year-over-year revenue increase to $26 billion in Q4, driven by unprecedented demand for its AI accelerators. Data center revenue alone reached $18.4 billion, up 409% from a year ago. CEO Jensen Huang said the results reflect 'a computing industry-wide shift toward accelerated computing and generative AI.'",
      publishedAt: new Date("2026-06-11"),
      companyId: nvidia.id,
      status: SignalStatus.ANALYZED,
    },
    {
      title: "NVIDIA Unveils Blackwell Ultra GPU Architecture",
      sourceUrl: "https://example.com/nvidia-blackwell-ultra",
      sourceType: SourceType.NEWS,
      rawContent:
        "At the annual GTC conference, NVIDIA unveiled its next-generation Blackwell Ultra GPU architecture, promising 4x performance improvement over the current H100 for large language model inference. The new chips will be manufactured on TSMC's 3nm process and are expected to ship in Q3 2026. Major cloud providers including AWS, Azure, and GCP have already placed orders.",
      publishedAt: new Date("2026-06-07"),
      companyId: nvidia.id,
      status: SignalStatus.ANALYZED,
    },
    {
      title: "NVIDIA Expands Sovereign AI Partnerships with 12 Nations",
      sourceUrl: "https://example.com/nvidia-sovereign-ai",
      sourceType: SourceType.NEWS,
      rawContent:
        "NVIDIA announced partnerships with 12 additional nations to build sovereign AI infrastructure, bringing its total government partnerships to 28. The partnerships involve deploying NVIDIA DGX systems and providing training for local AI researchers. The deals are valued at approximately $4.2 billion in aggregate.",
      publishedAt: new Date("2026-06-05"),
      companyId: nvidia.id,
      status: SignalStatus.ANALYZED,
    },
    {
      title: "NVIDIA CUDA Ecosystem Surpasses 5 Million Developers",
      sourceUrl: "https://example.com/nvidia-cuda",
      sourceType: SourceType.BLOG,
      rawContent:
        "NVIDIA's CUDA parallel computing platform has surpassed 5 million registered developers, the company announced in a blog post. The milestone represents 60% growth over the past year. The company attributed the growth to the explosion of AI and machine learning workloads, which rely heavily on CUDA for GPU acceleration.",
      publishedAt: new Date("2026-06-03"),
      companyId: nvidia.id,
      status: SignalStatus.ANALYZED,
    },
    {
      title: "NVIDIA Hiring Surge in Robotics Division",
      sourceUrl: "https://example.com/nvidia-robotics-hiring",
      sourceType: SourceType.JOB_POSTING,
      rawContent:
        "NVIDIA has posted 47 new job openings in its robotics and embodied AI division, a 300% increase from the previous quarter. Positions span computer vision, motion planning, and simulation engineering. The hiring surge suggests NVIDIA is making a serious push into the physical AI market beyond data center GPUs.",
      publishedAt: new Date("2026-06-01"),
      companyId: nvidia.id,
      status: SignalStatus.ANALYZED,
    },
  ];

  for (const signal of signals) {
    await prisma.signal.upsert({
      where: { id: signal.sourceUrl },
      update: {},
      create: signal,
    });
  }

  const allSignals = await prisma.signal.findMany({
    where: { status: SignalStatus.ANALYZED },
  });

  const analysisTemplates = [
    {
      summary:
        "Strong financial performance driven by product ecosystem strength and services growth. Signals indicate continued investment in AI and hardware innovation.",
      keyFacts: [
        {
          text: "Record quarterly revenue of $94.9 billion",
          category: "financial",
          confidence: 0.95,
        },
        {
          text: "Services revenue reached $22.3 billion all-time high",
          category: "financial",
          confidence: 0.93,
        },
        {
          text: "Installed base exceeds 2.2 billion active devices",
          category: "strategic",
          confidence: 0.88,
        },
      ],
      sentiment: Sentiment.POSITIVE,
      strategicThemes: [
        {
          label: "ecosystem-expansion",
          evidence: ["Services revenue growth", "2.2B active devices"],
        },
        {
          label: "ai-investment",
          evidence: ["New ML division", "On-device AI focus"],
        },
      ],
      confidence: 0.87,
      modelUsed: "gpt-4-turbo",
    },
    {
      summary:
        "Strategic expansion into new markets with significant capital investment. Signals suggest aggressive growth strategy and competitive positioning.",
      keyFacts: [
        {
          text: "New Gigafactory with 500K annual capacity",
          category: "strategic",
          confidence: 0.92,
        },
        {
          text: "Model 2 targeting sub-$25K price point",
          category: "market",
          confidence: 0.85,
        },
      ],
      sentiment: Sentiment.POSITIVE,
      strategicThemes: [
        {
          label: "market-expansion",
          evidence: ["Southeast Asian expansion", "Affordable EV segment"],
        },
        {
          label: "manufacturing-scale",
          evidence: ["500K capacity Gigafactory"],
        },
      ],
      confidence: 0.82,
      modelUsed: "gpt-4-turbo",
    },
    {
      summary:
        "Exceptional growth trajectory fueled by AI infrastructure demand. Company is well-positioned as the primary beneficiary of the AI computing shift.",
      keyFacts: [
        {
          text: "262% YoY revenue growth to $26B",
          category: "financial",
          confidence: 0.97,
        },
        {
          text: "Data center revenue up 409% to $18.4B",
          category: "financial",
          confidence: 0.96,
        },
        {
          text: "Blackwell Ultra promises 4x inference performance",
          category: "strategic",
          confidence: 0.89,
        },
      ],
      sentiment: Sentiment.POSITIVE,
      strategicThemes: [
        {
          label: "ai-infrastructure-dominance",
          evidence: ["262% revenue growth", "409% data center growth"],
        },
        {
          label: "next-gen-architecture",
          evidence: ["Blackwell Ultra", "3nm process", "4x performance"],
        },
      ],
      confidence: 0.91,
      modelUsed: "gpt-4-turbo",
    },
  ];

  for (let i = 0; i < allSignals.length; i++) {
    const signal = allSignals[i];
    const template = analysisTemplates[i % analysisTemplates.length];

    await prisma.analysis.create({
      data: {
        signalId: signal.id,
        agentPersona: "ANALYST",
        summary: template.summary,
        keyFacts: template.keyFacts,
        sentiment: template.sentiment,
        strategicThemes: template.strategicThemes,
        confidence: template.confidence + (Math.random() * 0.1 - 0.05),
        modelUsed: template.modelUsed,
      },
    });
  }

  const articles = [
    {
      title: "Apple Signals Aggressive AI Push with New Division and Record Services Growth",
      slug: "apple-ai-push-record-services",
      summary:
        "Apple's establishment of a new machine learning division, combined with record services revenue, signals a strategic pivot toward on-device AI while strengthening its ecosystem moat.",
      body: `## Key Findings

Apple Inc. is making decisive moves in the artificial intelligence space while simultaneously reporting record financial performance. The establishment of a dedicated machine learning division under John Giannandrea represents a significant organizational commitment to on-device AI capabilities.

## Evidence

The company's Q4 revenue of $94.9 billion exceeded analyst expectations, with the services segment reaching an all-time high of $22.3 billion. This dual signal — heavy AI investment combined with services growth — suggests Apple is positioning itself as a full-stack AI platform company.

The hiring freeze in hardware engineering, juxtaposed with continued AI hiring, further confirms the strategic reallocation of resources toward software and intelligence capabilities.

## Strategic Implications

Apple appears to be executing a three-pronged strategy:
1. **On-device AI**: Reduce dependence on cloud-based AI services
2. **Ecosystem monetization**: Leverage 2.2B active devices for services revenue
3. **Cost optimization**: Freeze hardware hiring while investing in AI talent

## Outlook

We assess with **high confidence (0.87)** that Apple will announce major on-device AI features at WWDC 2027, representing a competitive response to Google and Microsoft's cloud-based AI offerings.`,
      companyId: apple.id,
      status: "PUBLISHED" as const,
      publishedAt: new Date("2026-06-13"),
      authorId: adminUser.id,
      analysisIds: [],
    },
    {
      title: "Tesla's Multi-Front Expansion: Gigafactories, Robotaxis, and Energy Storage",
      slug: "tesla-multi-front-expansion",
      summary:
        "Tesla is simultaneously expanding manufacturing capacity, launching autonomous ride-hailing, and scaling energy storage — three growth vectors that could reshape the company's valuation.",
      body: `## Key Findings

Tesla is executing one of the most ambitious multi-front expansions in automotive history. The opening of the Indonesia Gigafactory, launch of the Austin robotaxi pilot, and 152% surge in energy storage deployments represent three distinct growth vectors converging simultaneously.

## Evidence

The Indonesia facility targets the sub-$25,000 EV market with the next-generation Model 2, while the Austin robotaxi pilot tests Tesla's autonomous driving technology in a commercial setting. Meanwhile, the energy storage segment is growing so rapidly that CEO Elon Musk projects it could rival the automotive business within five years.

## Strategic Implications

Tesla is diversifying beyond automotive manufacturing into:
1. **Mobility-as-a-Service**: Robotaxi fleet operations
2. **Energy Infrastructure**: Grid-scale storage solutions
3. **Emerging Markets**: Southeast Asian manufacturing hub

## Outlook

We assess with **moderate-high confidence (0.82)** that Tesla's stock will re-rate as the market begins pricing in revenue from these three distinct business lines rather than treating Tesla as a pure-play automaker.`,
      companyId: tesla.id,
      status: "PUBLISHED" as const,
      publishedAt: new Date("2026-06-14"),
      authorId: adminUser.id,
      analysisIds: [],
    },
    {
      title: "NVIDIA's AI Dominance Deepens: 262% Revenue Growth and the Road Ahead",
      slug: "nvidia-ai-dominance-262-growth",
      summary:
        "NVIDIA's extraordinary 262% revenue growth confirms its position as the undisputed leader in AI computing infrastructure, but questions about sustainability and competition loom.",
      body: `## Key Findings

NVIDIA Corporation has delivered what may be the most remarkable quarterly results in semiconductor history: 262% year-over-year revenue growth to $26 billion, with data center revenue alone up 409%. The company's Blackwell Ultra architecture promises another 4x performance leap.

## Evidence

The numbers speak for themselves — $18.4 billion in data center revenue, partnerships with 28 nations for sovereign AI infrastructure, and a CUDA developer ecosystem exceeding 5 million. The hiring surge in robotics (47 new positions, 300% increase) signals expansion beyond data center GPUs.

## Strategic Implications

NVIDIA is building a multi-layered moat:
1. **Hardware leadership**: 3nm Blackwell Ultra with 4x inference improvement
2. **Software ecosystem**: 5M+ CUDA developers create switching costs
3. **Government partnerships**: 28 sovereign AI deals create geopolitical lock-in
4. **Physical AI**: Robotics hiring suggests embodied AI is the next frontier

## Outlook

We assess with **high confidence (0.91)** that NVIDIA will maintain its AI chip dominance through 2027, though competition from AMD, Intel, and custom silicon from hyperscalers will gradually erode margins. The robotics push represents the most significant long-term growth vector beyond data center.`,
      companyId: nvidia.id,
      status: "PUBLISHED" as const,
      publishedAt: new Date("2026-06-14"),
      authorId: adminUser.id,
      analysisIds: [],
    },
  ];

  for (const article of articles) {
    await prisma.article.upsert({
      where: { slug: article.slug },
      update: {},
      create: {
        ...article,
        agentPersona: "ANALYST",
      },
    });
  }

  console.log("Seeding completed successfully!");
  console.log(`  - ${await prisma.user.count()} users`);
  console.log(`  - ${await prisma.company.count()} companies`);
  console.log(`  - ${await prisma.signal.count()} signals`);
  console.log(`  - ${await prisma.analysis.count()} analyses`);
  console.log(`  - ${await prisma.article.count()} articles`);
}

main()
  .catch((e) => {
    console.error("Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
