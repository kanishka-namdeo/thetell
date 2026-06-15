import { auth } from "@/lib/auth";
import { SessionProvider } from "@/components/providers/session-provider";
import { cn } from "@/lib/utils";
import { Playfair_Display, Lora, Inter, JetBrains_Mono, Geist } from "next/font/google";
import "./globals.css";

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
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
