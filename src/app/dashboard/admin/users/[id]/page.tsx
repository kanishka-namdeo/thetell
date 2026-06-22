"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  ArrowLeft,
  ShieldCheck,
  User as UserIcon,
  Mail,
  Calendar,
  FileText,
  Bookmark,
  Trash2,
  Key,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import Link from "next/link";

interface UserData {
  id: string;
  name: string | null;
  email: string | null;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED";
  emailVerified: Date | null;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    articles: number;
    watchedCompanies: number;
  };
}

export default function AdminUserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  const [user, setUser] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadUser() {
      try {
        const response = await fetch(`/api/v1/admin/users/${userId}`);
        if (!response.ok) throw new Error("Failed to fetch user");
        const data = await response.json();
        if (!cancelled) setUser(data);
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Failed to fetch user";
          setError(message);
          toast.error(message);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    loadUser();
    return () => { cancelled = true; };
  }, [userId]);

  async function handleRoleChange(newRole: "USER" | "ADMIN") {
    if (!user) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/v1/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!response.ok) {
        const data = await response.json();
        toast.error(data.message || "Failed to update role");
        return;
      }
      setUser({ ...user, role: newRole });
      toast.success("Role updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update role");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusChange(newStatus: "ACTIVE" | "SUSPENDED") {
    if (!user) return;
    setIsSaving(true);
    try {
      const response = await fetch(`/api/v1/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!response.ok) {
        const data = await response.json();
        toast.error(data.message || "Failed to update status");
        return;
      }
      setUser({ ...user, status: newStatus });
      toast.success("Status updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update status");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleResetPassword() {
    setIsResetting(true);
    try {
      const response = await fetch(
        `/api/v1/admin/users/${userId}/reset-password`,
        { method: "POST" }
      );
      if (!response.ok) {
        const data = await response.json();
        toast.error(data.message || "Failed to reset password");
        return;
      }
      const data = await response.json();
      setTempPassword(data.temporaryPassword);
      toast.success("Password reset successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reset password");
    } finally {
      setIsResetting(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/v1/admin/users/${userId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json();
        toast.error(data.message || "Failed to delete user");
        return;
      }
      toast.success("User deleted");
      router.push("/dashboard/admin/users");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete user");
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 lg:p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64 lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 lg:p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Failed to load user</AlertTitle>
          <AlertDescription className="space-y-4">
            <p>{error}</p>
            <Button onClick={() => window.location.reload()} variant="outline">
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-4 lg:p-6">
        <p className="text-muted-foreground">User not found</p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Back link */}
      <Link
        href="/dashboard/admin/users"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to users
      </Link>

      {/* Page Header */}
      <div className="border-b-2 border-foreground pb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-widest font-sans text-muted-foreground mb-1">
              Admin / Users
            </p>
            <h1 className="text-3xl font-serif font-bold">
              {user.name || user.email || "Unknown User"}
            </h1>
            <p className="text-sm text-muted-foreground font-body mt-1">
              {user.email}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={user.role === "ADMIN" ? "default" : "outline"}
              className="text-sm"
            >
              {user.role}
            </Badge>
            <Badge
              variant={user.status === "ACTIVE" ? "default" : "destructive"}
              className="text-sm"
            >
              {user.status}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User Profile */}
        <Card className="border-2 border-foreground">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <UserIcon className="h-5 w-5" />
              Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Name</Label>
              <p className="text-sm font-medium">{user.name || "—"}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Mail className="h-3 w-3" /> Email
              </Label>
              <p className="text-sm font-medium">{user.email || "—"}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Joined
              </Label>
              <p className="text-sm font-medium">
                {new Date(user.createdAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Email Verified</Label>
              <p className="text-sm">
                {user.emailVerified ? (
                  <Badge variant="outline" className="text-xs bg-success/10">
                    Verified
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    Not verified
                  </Badge>
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Role & Status Management */}
        <Card className="border-2 border-foreground lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Role & Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Role</Label>
              <div className="flex items-center gap-3">
                <Select
                  value={user.role}
                  onValueChange={(v) => handleRoleChange(v as "USER" | "ADMIN")}
                  disabled={isSaving}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USER">User</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                  </SelectContent>
                </Select>
                {isSaving && (
                  <span className="text-xs text-muted-foreground">Saving...</span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Account Status</Label>
              <div className="flex items-center gap-3">
                <Select
                  value={user.status}
                  onValueChange={(v) =>
                    handleStatusChange(v as "ACTIVE" | "SUSPENDED")
                  }
                  disabled={isSaving}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  </SelectContent>
                </Select>
                {isSaving && (
                  <span className="text-xs text-muted-foreground">Saving...</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Suspended users cannot log in to the platform.
              </p>
            </div>

            <div className="border-t pt-4 space-y-3">
              <p className="text-xs uppercase tracking-widest font-sans text-muted-foreground">
                Actions
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowResetDialog(true)}
                >
                  <Key className="h-4 w-4 mr-2" />
                  Reset Password
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete User
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 border-l-2 border-foreground pl-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-serif font-bold">
                  {user._count.articles}
                </p>
                <p className="text-xs text-muted-foreground">Articles written</p>
              </div>
            </div>
            <div className="flex items-center gap-3 border-l-2 border-foreground pl-3">
              <Bookmark className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-serif font-bold">
                  {user._count.watchedCompanies}
                </p>
                <p className="text-xs text-muted-foreground">Companies watched</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete User Account
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. All data associated with this user will be
              permanently deleted, including articles and watchlist entries.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm">
              Are you sure you want to delete{" "}
              <strong>{user.name || user.email}</strong>?
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete User
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog
        open={showResetDialog}
        onOpenChange={(open) => {
          setShowResetDialog(open);
          if (!open) setTempPassword(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Reset Password
            </DialogTitle>
            <DialogDescription>
              This will generate a new temporary password for the user. They will need
              to change it on next login.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {tempPassword ? (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Temporary Password
                </Label>
                <div className="p-3 bg-muted rounded-md font-mono text-sm break-all">
                  {tempPassword}
                </div>
                <p className="text-xs text-muted-foreground">
                  Share this password securely with the user.
                </p>
              </div>
            ) : (
              <p className="text-sm">
                Generate a new temporary password for{" "}
                <strong>{user.name || user.email}</strong>?
              </p>
            )}
          </div>
          <DialogFooter>
            {tempPassword ? (
              <Button onClick={() => setShowResetDialog(false)}>Done</Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setShowResetDialog(false)}
                  disabled={isResetting}
                >
                  Cancel
                </Button>
                <Button onClick={handleResetPassword} disabled={isResetting}>
                  {isResetting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Key className="h-4 w-4 mr-2" />
                      Generate Password
                    </>
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
