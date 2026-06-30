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
    />
  );
}

export default function SignalDetailLoading() {
  return (
    <Section>
      <Container className="max-w-4xl">
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
          <SkeletonLine width="w-32" height="h-5" />
          <SkeletonLine width="w-full" height="h-12" />
          <div className="flex gap-3">
            <motion.div
              animate={{
                opacity: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="h-5 w-20 bg-muted"
            />
            <SkeletonLine width="w-24" height="h-5" />
            <SkeletonLine width="w-16" height="h-5" />
            <SkeletonLine width="w-16" height="h-5" />
          </div>
        </motion.div>

        {/* Content Skeleton */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="border-2 border-foreground p-6 mb-6 space-y-4"
        >
          <SkeletonLine width="w-32" height="h-6" />
          {Array.from({ length: 8 }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scaleX: 0.3 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ duration: 0.4, delay: i * 0.05, ease: "easeOut" }}
              className="origin-left"
            >
              <SkeletonLine width="w-full" height="h-4" />
            </motion.div>
          ))}
        </motion.div>

        {/* Analysis Cards Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.3 + i * 0.1 }}
              className="border-2 border-foreground p-6 space-y-4"
            >
              <div className="flex justify-between">
                <SkeletonLine width="w-24" height="h-5" />
                <div className="flex gap-2">
                  <SkeletonLine width="w-16" height="h-5" />
                  <SkeletonLine width="w-16" height="h-5" />
                </div>
              </div>
              <div className="space-y-2">
                <SkeletonLine width="w-20" height="h-4" />
                {Array.from({ length: 4 }).map((_, j) => (
                  <SkeletonLine key={j} width="w-full" height="h-4" />
                ))}
              </div>
              <div className="space-y-2">
                <SkeletonLine width="w-24" height="h-4" />
                <div className="flex gap-2">
                  <SkeletonLine width="w-20" height="h-5" />
                  <SkeletonLine width="w-24" height="h-5" />
                  <SkeletonLine width="w-16" height="h-5" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </Container>
    </Section>
  );
}
