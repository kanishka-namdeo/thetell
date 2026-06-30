"use client";

import { Container, Section } from "@/components";
import { motion } from "motion/react";

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const fadeIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: [0.4, 0.0, 0.2, 1] },
};

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

function SkeletonCard({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={fadeIn}
      className="border-2 border-foreground p-4 space-y-3"
    >
      {children}
    </motion.div>
  );
}

export default function PublicFeedLoading() {
  return (
    <>
      {/* Hero Skeleton */}
      <Section className="border-b-4 border-foreground">
        <Container>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <SkeletonLine width="w-24" height="h-6" />
            <div className="h-48 w-full border-2 border-foreground p-6 space-y-3">
              <SkeletonLine width="w-32" height="h-5" />
              <SkeletonLine width="w-3/4" height="h-8" />
              <SkeletonLine width="w-1/2" height="h-4" />
              <div className="flex gap-2 pt-2">
                <SkeletonLine width="w-20" height="h-5" />
                <SkeletonLine width="w-24" height="h-5" />
                <SkeletonLine width="w-16" height="h-5" />
              </div>
            </div>
          </motion.div>
        </Container>
      </Section>

      {/* Main Feed Skeleton */}
      <Section texture>
        <Container>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <div className="mb-8 space-y-2">
              <SkeletonLine width="w-32" height="h-4" />
              <SkeletonLine width="w-64" height="h-8" />
              <SkeletonLine width="w-40" height="h-3" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Feed Column */}
              <div className="lg:col-span-2 space-y-4">
                {/* Filter Skeleton */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2, duration: 0.3 }}
                  className="flex gap-2 mt-4"
                >
                  <SkeletonLine width="w-20" height="h-7" />
                  <SkeletonLine width="w-24" height="h-7" />
                  <SkeletonLine width="w-24" height="h-7" />
                </motion.div>

                {/* Signal Cards Skeleton - staggered reveal */}
                <motion.div
                  variants={staggerContainer}
                  initial="initial"
                  animate="animate"
                  className="space-y-4"
                >
                  {Array.from({ length: 5 }).map((_, i) => (
                    <SkeletonCard key={i}>
                      <SkeletonLine width="w-16" height="h-4" />
                      <div className="flex justify-between">
                        <SkeletonLine width="w-3/4" height="h-6" />
                        <SkeletonLine width="w-16" height="h-4" />
                      </div>
                      <div className="flex gap-2">
                        <SkeletonLine width="w-20" height="h-5" />
                        <SkeletonLine width="w-16" height="h-5" />
                        <SkeletonLine width="w-16" height="h-5" />
                        <SkeletonLine width="w-16" height="h-5" />
                      </div>
                    </SkeletonCard>
                  ))}
                </motion.div>
              </div>

              {/* Sidebar Skeleton */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.3 }}
                className="space-y-6"
              >
                <div className="border-2 border-foreground p-4 space-y-3">
                  <SkeletonLine width="w-32" height="h-6" />
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex justify-between">
                      <SkeletonLine width="w-20" height="h-5" />
                      <SkeletonLine width="w-8" height="h-5" />
                    </div>
                  ))}
                </div>

                <div className="border-2 border-foreground p-4 space-y-3">
                  <SkeletonLine width="w-32" height="h-6" />
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="space-y-1">
                      <SkeletonLine width="w-full" height="h-4" />
                      <div className="flex gap-2">
                        <SkeletonLine width="w-16" height="h-3" />
                        <SkeletonLine width="w-12" height="h-3" />
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          </motion.div>
        </Container>
      </Section>
    </>
  );
}
