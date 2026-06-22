import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/dashboard/admin/correlation",
        destination: "/dashboard/admin/intelligence",
        permanent: true,
      },
      {
        source: "/dashboard/admin/themes",
        destination: "/dashboard/admin/intelligence/themes",
        permanent: true,
      },
      {
        source: "/dashboard/admin/hypotheses",
        destination: "/dashboard/admin/intelligence/hypotheses",
        permanent: true,
      },
      {
        source: "/dashboard/admin/inferences",
        destination: "/dashboard/admin/intelligence/inferences",
        permanent: true,
      },
      {
        source: "/dashboard/admin/moderation",
        destination: "/dashboard/admin/content",
        permanent: true,
      },
      {
        source: "/dashboard/admin/moderation/queue",
        destination: "/dashboard/admin/content",
        permanent: true,
      },
      {
        source: "/dashboard/admin/moderation/content",
        destination: "/dashboard/admin/content/library",
        permanent: true,
      },
      {
        source: "/dashboard/admin/moderation/settings",
        destination: "/dashboard/admin/content/settings",
        permanent: true,
      },
      {
        source: "/dashboard/admin/system",
        destination: "/dashboard/admin/operations",
        permanent: true,
      },
      {
        source: "/dashboard/admin/system/scrapers",
        destination: "/dashboard/admin/operations/scrapers",
        permanent: true,
      },
      {
        source: "/dashboard/admin/system/jobs",
        destination: "/dashboard/admin/operations/jobs",
        permanent: true,
      },
      {
        source: "/dashboard/admin/pipelines",
        destination: "/dashboard/admin/operations/pipelines",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
