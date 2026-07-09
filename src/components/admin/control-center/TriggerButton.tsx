"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Play, CheckCircle, XCircle } from "lucide-react";
import { logger } from "@/lib/logger";
import { motion, AnimatePresence } from "motion/react";
import { useControlCenterMotion } from "./useMotion";

interface TriggerButtonProps {
  stageName: string;
  triggerLabel: string;
  confirmationMessage: string;
  onTrigger: () => Promise<void>;
  disabled?: boolean;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
}

export function TriggerButton({
  stageName,
  triggerLabel,
  confirmationMessage,
  onTrigger,
  disabled = false,
  variant = "outline",
  size = "sm",
}: TriggerButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [feedbackState, setFeedbackState] = useState<"idle" | "success" | "error">("idle");
  const { shouldAnimate, transitions, variants } = useControlCenterMotion();
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  async function handleTrigger() {
    setIsLoading(true);
    setFeedbackState("idle");
    try {
      await onTrigger();
      setIsOpen(false);
      setFeedbackState("success");
      feedbackTimerRef.current = setTimeout(() => setFeedbackState("idle"), 1500);
    } catch (error) {
      logger.error("control_center.trigger_failed", { stageName, error: String(error) });
      setFeedbackState("error");
      feedbackTimerRef.current = setTimeout(() => setFeedbackState("idle"), 1500);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <motion.div
        animate={feedbackState === "error" && shouldAnimate ? variants.errorShake.animate : {}}
        transition={feedbackState === "error" ? transitions.fast : undefined}
        className="relative"
      >
        <Button
          variant={variant}
          size={size}
          onClick={() => setIsOpen(true)}
          disabled={disabled || isLoading}
          className="gap-2 relative overflow-hidden"
        >
          <AnimatePresence mode="wait">
            {feedbackState === "success" ? (
              <motion.div
                key="success"
                initial={shouldAnimate ? { scale: 0, opacity: 0 } : false}
                animate={{ scale: 1, opacity: 1 }}
                exit={shouldAnimate ? { scale: 0.8, opacity: 0 } : {}}
                transition={transitions.fast}
              >
                <CheckCircle className="size-4 text-success" />
              </motion.div>
            ) : feedbackState === "error" ? (
              <motion.div
                key="error"
                initial={shouldAnimate ? { scale: 0, opacity: 0 } : false}
                animate={{ scale: 1, opacity: 1 }}
                exit={shouldAnimate ? { scale: 0.8, opacity: 0 } : {}}
                transition={transitions.fast}
              >
                <XCircle className="size-4 text-destructive" />
              </motion.div>
            ) : isLoading ? (
              <motion.div
                key="loading"
                initial={shouldAnimate ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                exit={shouldAnimate ? { opacity: 0 } : {}}
                transition={transitions.instant}
              >
                <Loader2 className="size-4 animate-spin" />
              </motion.div>
            ) : (
              <motion.div
                key="play"
                initial={shouldAnimate ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                exit={shouldAnimate ? { opacity: 0 } : {}}
                transition={transitions.instant}
              >
                <Play className="size-4" />
              </motion.div>
            )}
          </AnimatePresence>
          {triggerLabel}
          <AnimatePresence>
            {feedbackState === "success" && shouldAnimate && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={transitions.normal}
                className="absolute inset-0 bg-success/20 pointer-events-none"
              />
            )}
          </AnimatePresence>
        </Button>
      </motion.div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trigger {stageName}</DialogTitle>
            <DialogDescription>{confirmationMessage}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleTrigger} disabled={isLoading}>
              <AnimatePresence mode="wait">
                {isLoading ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={transitions.instant}
                    className="flex items-center gap-2"
                  >
                    <Loader2 className="size-4 animate-spin" />
                    <span>Running...</span>
                  </motion.div>
                ) : (
                  <motion.div
                    key="confirm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={transitions.instant}
                    className="flex items-center gap-2"
                  >
                    <Play className="size-4" />
                    <span>Confirm</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
