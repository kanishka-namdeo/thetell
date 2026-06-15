import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProfileForm } from "@/components/dashboard/profile-form";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();
  
  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  if (!user) {
    redirect("/sign-in");
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Page Header */}
      <div className="border-b-2 border-foreground pb-4">
        <p className="text-[10px] uppercase tracking-widest font-sans text-muted-foreground mb-1">
          Account
        </p>
        <h1 className="text-3xl font-serif font-bold">Profile</h1>
        <p className="text-sm text-muted-foreground font-body mt-1">
          Manage your account information
        </p>
      </div>

      {/* User Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest font-sans text-muted-foreground mb-1">
                Name
              </p>
              <p className="text-sm font-body">{user.name || "Not set"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest font-sans text-muted-foreground mb-1">
                Email
              </p>
              <p className="text-sm font-body">{user.email || "Not set"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest font-sans text-muted-foreground mb-1">
                Role
              </p>
              <Badge variant="outline">{user.role}</Badge>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest font-sans text-muted-foreground mb-1">
                Member Since
              </p>
              <p className="text-sm font-body">
                {new Date(user.createdAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Profile Form */}
      <ProfileForm
        user={{
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt.toISOString(),
        }}
      />
    </div>
  );
}
