import { useEffect, useMemo } from "react";
import { 
  useGetProfile, 
  useUpdateProfile, 
  getGetProfileQueryKey 
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { AlertCircle, RefreshCw, Save } from "lucide-react";

const profileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  college: z.string().optional(),
  degree: z.string().optional(),
  branch: z.string().optional(),
  graduationYear: z.coerce.number().min(2000).max(2040).optional().or(z.literal("").transform(() => undefined)),
  cgpa: z.coerce.number().min(0).max(10).optional().or(z.literal("").transform(() => undefined)),
  skills: z.string().optional(), // We'll manage it as a comma-separated string for simplicity in the UI
  resumeUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  linkedinUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  githubUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export function ProfilePage() {
  const queryClient = useQueryClient();
  const { data: profile, isLoading, isError, refetch } = useGetProfile();
  const updateProfile = useUpdateProfile();

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: "",
      college: "",
      degree: "",
      branch: "",
      graduationYear: undefined,
      cgpa: undefined,
      skills: "",
      resumeUrl: "",
      linkedinUrl: "",
      githubUrl: "",
    },
  });

  useEffect(() => {
    if (profile) {
      form.reset({
        name: profile.name || "",
        college: profile.college || "",
        degree: profile.degree || "",
        branch: profile.branch || "",
        graduationYear: profile.graduationYear || undefined,
        cgpa: profile.cgpa || undefined,
        skills: profile.skills?.join(", ") || "",
        resumeUrl: profile.resumeUrl || "",
        linkedinUrl: profile.linkedinUrl || "",
        githubUrl: profile.githubUrl || "",
      });
    }
  }, [profile, form]);

  const formValues = form.watch();
  const completeness = useMemo(() => {
    const fields = [
      formValues.name,
      formValues.college,
      formValues.degree,
      formValues.branch,
      formValues.graduationYear,
      formValues.cgpa,
      formValues.skills,
      formValues.resumeUrl,
      formValues.linkedinUrl,
      formValues.githubUrl,
    ];
    const filled = fields.filter((v) => v !== undefined && v !== "" && v !== null).length;
    return Math.round((filled / fields.length) * 100);
  }, [formValues]);

  const onSubmit = (data: ProfileFormValues) => {
    const skillsArray = data.skills 
      ? data.skills.split(",").map(s => s.trim()).filter(Boolean) 
      : [];

    updateProfile.mutate({
      data: {
        ...data,
        skills: skillsArray,
      }
    }, {
      onSuccess: () => {
        toast.success("Profile updated successfully");
        queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
      },
      onError: (err) => {
        toast.error("Failed to update profile", {
          description: err instanceof Error ? err.message : "Unknown error occurred"
        });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32 mb-2" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent className="space-y-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center space-y-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Failed to load profile</h2>
        </div>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground mt-1">Manage your academic details and external links.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>
            Update your academic records and resume. These will be used to track your completeness.
          </CardDescription>
        </CardHeader>

        {/* Completeness bar */}
        <div className="mx-6 mb-2 rounded-lg border border-border bg-muted/40 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-muted-foreground">Profile completeness</span>
            <span className={`text-xs font-semibold ${completeness === 100 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}>
              {completeness}%
            </span>
          </div>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                completeness === 100
                  ? "bg-emerald-500"
                  : completeness >= 60
                    ? "bg-primary"
                    : "bg-amber-500"
              }`}
              style={{ width: `${completeness}%` }}
            />
          </div>
          {completeness < 100 && (
            <p className="text-[11px] text-muted-foreground mt-1.5">
              {completeness < 40
                ? "Add your details to get personalised job recommendations."
                : completeness < 80
                  ? "Almost there — fill remaining fields to unlock full recommendations."
                  : "Just a few more fields to complete your profile."}
            </p>
          )}
        </div>

        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              
              <div className="grid gap-6 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="college"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>College</FormLabel>
                      <FormControl>
                        <Input placeholder="Engineering College" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="degree"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Degree</FormLabel>
                      <FormControl>
                        <Input placeholder="B.Tech" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="branch"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Branch</FormLabel>
                      <FormControl>
                        <Input placeholder="Computer Science" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="graduationYear"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Graduation Year</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="2025" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="cgpa"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CGPA (out of 10)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="8.5" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="skills"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Skills</FormLabel>
                      <FormControl>
                        <Input placeholder="React, Node.js, Python" {...field} />
                      </FormControl>
                      <FormDescription>Comma separated list of skills.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="resumeUrl"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Resume URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://drive.google.com/..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="linkedinUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>LinkedIn URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://linkedin.com/in/..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="githubUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>GitHub URL</FormLabel>
                      <FormControl>
                        <Input placeholder="https://github.com/..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={updateProfile.isPending}>
                  {updateProfile.isPending ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Changes
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
