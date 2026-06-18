"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface LoadMoreButtonProps {
  cursor: string;
}

export function LoadMoreButton({ cursor }: LoadMoreButtonProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const handleLoadMore = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("cursor", cursor);
    router.push(`/?${params.toString()}`);
  };

  return (
    <Button variant="outline" onClick={handleLoadMore}>
      Load More
    </Button>
  );
}
