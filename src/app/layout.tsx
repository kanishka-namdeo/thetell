import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { SessionProvider } from "@/components/providers/session-provider";
import { cn } from "@/lib/utils";
import { Playfair_Display, Lora, Inter, JetBrains_Mono, Geist } from "next/font/google";
import "./globals.css";

let metadataBase: URL;
try {
  metadataBase = new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
} catch {
  metadataBase = new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: "The Tell",
    template: "%s | The Tell",
  },
  description:
    "AI-powered corporate intelligence platform that reads between the lines of public information to reveal corporate strategy.",
  icons: {
    icon: [
      { url: "/logos/favicon.ico" },
      { url: "/logos/logo-16.png", sizes: "16x16", type: "image/png" },
      { url: "/logos/logo-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/logos/logo-180.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "The Tell",
    description:
      "AI-powered corporate intelligence platform that reads between the lines of public information to reveal corporate strategy.",
    images: [{ url: "/logos/logo-1200.png", width: 1200, height: 1200, alt: "The Tell" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Tell",
    description:
      "AI-powered corporate intelligence platform that reads between the lines of public information to reveal corporate strategy.",
    images: ["/logos/logo-1200.png"],
  },
};

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        playfair.variable,
        lora.variable,
        jetbrainsMono.variable,
        "font-sans",
        geist.variable
      )}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <SessionProvider session={session}>{children}</SessionProvider>
      </body>
    </html>
  );
}
