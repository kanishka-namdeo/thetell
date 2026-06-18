"use client";

import { Container, Section } from "@/components";
import { motion } from "motion/react";

function SkeletonLine({ width, height = "h-4" }: { width: string; height?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scaleX: 0.3 }}
      animate={{ opacity: 1, scaleX: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={`${height} ${width} bg-muted origin-left`}
      style={{ borderRadius: 0 }}
    />
  );
}

export default function ArticleDetailLoading() {
  return (
    <Section>
      <Container className="max-w-3xl">
        {/* Back Link Skeleton */}
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          <SkeletonLine width="w-24" height="h-4" />
        </motion.div>

        {/* Header Skeleton */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="border-b-4 border-foreground pb-6 mb-6 space-y-3 mt-6"
        >
          <div className="flex gap-2">
            <SkeletonLine width="w-32" height="h-5" />
            <SkeletonLine width="w-24" height="h-5" />
          </div>
          <SkeletonLine width="w-full" height="h-12" />
          <SkeletonLine width="w-40" height="h-4" />
        </motion.div>

        {/* Article Content Skeleton - typesetting animation */}
        <motion.div
          initial="initial"
          animate="animate"
          variants={{
            animate: {
              transition: {
                staggerChildren: 0.06,
              },
            },
          }}
          className="space-y-4"
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <motion.div
              key={i}
              variants={{
                initial: { opacity: 0, scaleX: 0.3 },
                animate: { opacity: 1, scaleX: 1 },
              }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="origin-left"
            >
              <SkeletonLine
                width={i === 0 ? "w-full" : i === 7 ? "w-2/3" : "w-full"}
                height={i === 0 ? "h-6" : "h-4"}
              />
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </Section>
  );
}
