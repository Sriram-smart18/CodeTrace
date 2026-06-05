import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Camera, User, BadgeCheck, Mail, Calendar, Edit3, X, Save } from "lucide-react";

export default function Profile() {
  const { profile, user, session } = useAuth();
  const { toast } = useToast();

  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync profile data on load
  useEffect(() => {
    if (profile) {
      setName(profile.name || "");
      setUsername(profile.username || "");
      setBio(profile.bio || "");
      setAvatarUrl(profile.avatar_url || "");
    }
  }, [profile]);

  // Cancel edit handler
  const handleCancel = () => {
    if (profile) {
      setName(profile.name || "");
      setUsername(profile.username || "");
      setBio(profile.bio || "");
      setAvatarUrl(profile.avatar_url || "");
    }
    setIsEditing(false);
  };

  // Form submit handler
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setLoading(true);
    try {
      // Basic check for username formatting if provided
      if (username && !/^[a-zA-Z0-9_]{3,15}$/.test(username)) {
        toast({
          title: "Invalid Username",
          description: "Username must be 3-15 characters and contain only letters, numbers, or underscores.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          name,
          username: username || null,
          bio: bio || null,
          avatar_url: avatarUrl || null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", profile.user_id);

      if (error) {
        toast({
          title: "Failed to update profile",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Profile updated!",
          description: "Your changes have been saved successfully.",
        });
        setIsEditing(false);
        // Force refresh context session by reloading window or relying on Supabase onAuthStateChange
        // Fetching profile in AuthContext is already triggered by update or we can wait a bit
        setTimeout(() => window.location.reload(), 800);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      toast({
        title: "Failed to update profile",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Profile image upload handler
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;

    const file = files[0];
    const maxFileSize = 2 * 1024 * 1024; // 2MB limit

    // 1. File type check
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Only PNG, JPEG, JPG, and WEBP formats are accepted.",
        variant: "destructive",
      });
      return;
    }

    // 2. File size check
    if (file.size > maxFileSize) {
      toast({
        title: "File too large",
        description: "Avatar images must be less than 2MB.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `avatar-${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      // Upload file directly to Supabase storage bucket
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Fetch public link of uploaded asset
      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      setAvatarUrl(publicUrl);

      // Save directly to profiles table as well so the user gets instant feedback
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("user_id", user.id);

      if (profileError) {
        throw profileError;
      }

      toast({
        title: "Avatar uploaded!",
        description: "Your profile picture has been updated successfully.",
      });

      // Quick reload to propagate avatar changes to other headers/layouts
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not complete image upload transaction.";
      toast({
        title: "Upload failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Get Initials for Fallback
  const initials = profile.name
    ? profile.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "CT";

  return (
    <DashboardLayout role={profile.role}>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Banner Card */}
        <div className="relative rounded-2xl border border-white/5 bg-gradient-to-r from-primary/10 via-accent/5 to-card p-6 md:p-8 flex flex-col md:flex-row items-center md:items-start gap-6 shadow-md overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent -z-10" />
          
          {/* Avatar Section */}
          <div className="relative group cursor-pointer" onClick={triggerFileSelect}>
            <Avatar className="h-28 w-28 border-4 border-background ring-2 ring-primary/20 shadow-xl transition-all duration-300 group-hover:opacity-85">
              <AvatarImage src={avatarUrl} alt={name} className="object-cover" />
              <AvatarFallback className="text-2xl font-bold bg-primary/10 text-primary font-sans">{initials}</AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              {uploading ? (
                <Loader2 className="h-6 w-6 text-white animate-spin" />
              ) : (
                <Camera className="h-6 w-6 text-white" />
              )}
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleAvatarChange}
              accept="image/*"
              className="hidden"
              disabled={uploading}
            />
          </div>

          {/* User Meta Information */}
          <div className="flex-1 text-center md:text-left space-y-2 mt-2">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-2">
              <h2 className="text-2xl font-bold text-foreground">{name || "Unnamed User"}</h2>
              <span className="inline-flex items-center gap-1 bg-accent/25 text-accent text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize">
                <BadgeCheck className="h-3.5 w-3.5" /> {profile.role}
              </span>
            </div>
            {username && <p className="text-primary font-mono text-sm">@{username}</p>}
            <p className="text-sm text-muted-foreground max-w-lg leading-relaxed">
              {bio || "This user hasn't added a bio yet. Tell the classroom a little about yourself!"}
            </p>
          </div>

          <div className="md:self-start">
            {!isEditing && (
              <Button size="sm" onClick={() => setIsEditing(true)} className="gap-2">
                <Edit3 className="h-4 w-4" /> Edit Profile
              </Button>
            )}
          </div>
        </div>

        {/* Profile Details Card */}
        <Card className="shadow-lg border-white/5 bg-card/60 backdrop-blur-md">
          <CardHeader>
            <CardTitle>Profile Details</CardTitle>
            <CardDescription>Manage your display name, username, and biography</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Full Name */}
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={!isEditing}
                    required
                    placeholder="Enter your full name"
                    className="bg-background/50 border-white/10"
                  />
                </div>

                {/* Username */}
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={!isEditing}
                    placeholder="letters, numbers or underscores (e.g. janesmith_)"
                    className="bg-background/50 border-white/10 font-mono"
                  />
                </div>

                {/* Email (Read Only) */}
                <div className="space-y-2">
                  <Label htmlFor="email" className="flex items-center gap-1.5 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" /> Email Address
                  </Label>
                  <Input
                    id="email"
                    value={profile.email}
                    disabled={true}
                    className="bg-white/5 border-white/5 opacity-70 cursor-not-allowed"
                  />
                  <p className="text-[10px] text-muted-foreground/60 italic">Email address cannot be changed</p>
                </div>

                {/* Account Age */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5 text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" /> Enrolled Since
                  </Label>
                  <Input
                    value={new Date(profile.created_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                    disabled={true}
                    className="bg-white/5 border-white/5 opacity-70 cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Biography */}
              <div className="space-y-2">
                <Label htmlFor="bio">Biography / About</Label>
                <Textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  disabled={!isEditing}
                  placeholder="Share a short bio with your teachers and classrooms..."
                  className="bg-background/50 border-white/10 min-h-24 resize-none leading-relaxed"
                  maxLength={500}
                />
                <p className="text-[10px] text-muted-foreground text-right">{bio.length}/500 characters</p>
              </div>

              {/* Form Buttons */}
              {isEditing && (
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5 animate-fadeIn">
                  <Button type="button" variant="outline" onClick={handleCancel} disabled={loading} className="gap-1.5">
                    <X className="h-4 w-4" /> Cancel
                  </Button>
                  <Button type="submit" disabled={loading} className="gap-1.5 bg-primary hover:bg-primary/95 text-white">
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" /> Save Changes
                      </>
                    )}
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
