"use client";

import React from "react";
import { Container, Section, Headline, Body, Button, Metadata } from "@/components";
import Link from "next/link";
import { logger } from "@/lib/logger";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error("error-boundary.caught", { error: String(error), componentStack: errorInfo.componentStack });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Section>
          <Container className="max-w-2xl">
            <div className="flex flex-col items-center text-center py-16">
              <Headline level={1} size="section" className="mb-4">
                Edition Interrupted
              </Headline>
              <Body className="text-muted-foreground mb-6 max-w-md">
                Something went wrong while rendering this content.
                The editorial team has been alerted.
              </Body>
              {this.state.error && (
                <Metadata className="mb-6 block max-w-md truncate">
                  {this.state.error.message}
                </Metadata>
              )}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button variant="default" onClick={this.handleReset}>
                  Try Again
                </Button>
                <Link href="/">
                  <Button variant="outline">Go Home</Button>
                </Link>
              </div>
            </div>
          </Container>
        </Section>
      );
    }

    return this.props.children;
  }
}
