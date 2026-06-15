import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Menu,
  X,
  Search,
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Clock,
  ArrowRight,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  Plus,
  Minus,
  Check,
  ExternalLink,
  Download,
  Share2,
  Bookmark,
  Heart,
  Star,
  TrendingUp,
  TrendingDown,
  BarChart3,
  LineChart,
  PieChart,
  FileText,
  Newspaper,
  BookOpen,
  Edit3,
  MessageSquare,
  Send,
  Globe,
  Link2,
  Share,
  Code2,
  type LucideIcon,
} from "lucide-react";

export interface IconProps extends React.HTMLAttributes<HTMLDivElement> {
  icon: LucideIcon;
  size?: "sm" | "md" | "lg";
  bordered?: boolean;
  interactive?: boolean;
}

const Icon = React.forwardRef<HTMLDivElement, IconProps>(
  ({ className, icon: IconComponent, size = "md", bordered = false, interactive = false, ...props }, ref) => {
    const sizes = {
      sm: "h-4 w-4",
      md: "h-6 w-6",
      lg: "h-8 w-8",
    };

    const containerSizes = {
      sm: "h-8 w-8",
      md: "h-12 w-12",
      lg: "h-16 w-16",
    };

    const iconElement = (
      <IconComponent
        className={cn(
          sizes[size],
          "stroke-1",
          interactive && "transition-all duration-200"
        )}
        strokeWidth={1.5}
      />
    );

    if (bordered) {
      return (
        <div
          ref={ref}
          className={cn(
            "flex items-center justify-center border border-foreground bg-background transition-all duration-200",
            containerSizes[size],
            interactive && "hover:bg-foreground hover:text-background cursor-pointer",
            className
          )}
          {...props}
        >
          {iconElement}
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center",
          interactive && "cursor-pointer",
          className
        )}
        {...props}
      >
        {iconElement}
      </div>
    );
  }
);
Icon.displayName = "Icon";

export { Icon, Menu, X, Search, User, Mail, Phone, MapPin, Calendar, Clock, ArrowRight, ArrowLeft, ArrowUp, ArrowDown, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, Plus, Minus, Check, ExternalLink, Download, Share2, Bookmark, Heart, Star, TrendingUp, TrendingDown, BarChart3, LineChart, PieChart, FileText, Newspaper, BookOpen, Edit3, MessageSquare, Send, Globe, Link2, Share, Code2 };
