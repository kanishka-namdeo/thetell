import { config } from "dotenv";

async function main() {
  config({ path: ".env.local" });

  const { prisma } = await import("../src/lib/db");

  const emptyArticleId = "cmqw39wtf004ma8ln9hmqt4kz";

  console.log(`Deleting empty article: ${emptyArticleId}`);

  const deleted = await prisma.article.delete({
    where: { id: emptyArticleId },
  });

  console.log(`Deleted article:`, deleted);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
