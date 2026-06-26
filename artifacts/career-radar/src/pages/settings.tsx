import { useEffect } from "react";
import { useTheme } from "next-themes";
import { 
  useGetSettings, 
  useUpdateSettings, 
  getGetSettingsQueryKey 
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { AlertCircle, RefreshCw, Save } from "lucide-react";

const settingsSchema = z.object({
  emailNotifications: z.boolean(),
  deadlineAlertDays: z.coerce.number().min(1).max(30),
  theme: z.enum(["light", "dark", "system"]),
  timezone: z.string().min(1),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

export function SettingsPage() {
  const { setTheme } = useTheme();
  const queryClient = useQueryClient();
  const { data: settings, isLoading, isError, refetch } = useGetSettings();
  const updateSettings = useUpdateSettings();

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      emailNotifications: true,
      deadlineAlertDays: 3,
      theme: "system",
      timezone: "Asia/Kolkata",
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        emailNotifications: settings.emailNotifications,
        deadlineAlertDays: settings.deadlineAlertDays || 3,
        theme: (settings.theme as "light" | "dark" | "system") || "system",
        timezone: settings.timezone || "Asia/Kolkata",
      });
      // Sync theme with next-themes on load if it differs
      setTheme(settings.theme);
    }
  }, [settings, form, setTheme]);

  const onSubmit = (data: SettingsFormValues) => {
    updateSettings.mutate({
      data: {
        emailNotifications: data.emailNotifications,
        deadlineAlertDays: data.deadlineAlertDays,
        theme: data.theme,
        timezone: data.timezone,
      }
    }, {
      onSuccess: () => {
        toast.success("Settings updated successfully");
        setTheme(data.theme);
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      },
      onError: (err) => {
        toast.error("Failed to update settings", {
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
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex justify-between items-center">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-8 w-12" />
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
          <h2 className="text-xl font-semibold">Failed to load settings</h2>
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
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your app preferences and alerts.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>
            Customize how CareerRadar works for you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              
              <div className="space-y-6">
                <FormField
                  control={form.control}
                  name="theme"
                  render={({ field }) => (
                    <FormItem className="flex flex-col justify-between rounded-lg border p-4 sm:flex-row sm:items-center">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Appearance</FormLabel>
                        <FormDescription>
                          Select the theme for the dashboard.
                        </FormDescription>
                      </div>
                      <FormControl className="mt-2 sm:mt-0 w-[180px]">
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select theme" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="light">Light</SelectItem>
                            <SelectItem value="dark">Dark</SelectItem>
                            <SelectItem value="system">System</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="emailNotifications"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Email Notifications</FormLabel>
                        <FormDescription>
                          Receive emails about upcoming deadlines.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="deadlineAlertDays"
                  render={({ field }) => (
                    <FormItem className="flex flex-col justify-between rounded-lg border p-4 sm:flex-row sm:items-center">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Alert Days</FormLabel>
                        <FormDescription>
                          Days before a deadline to alert you.
                        </FormDescription>
                      </div>
                      <FormControl className="mt-2 sm:mt-0 w-[180px]">
                        <Input type="number" min={1} max={30} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="timezone"
                  render={({ field }) => (
                    <FormItem className="flex flex-col justify-between rounded-lg border p-4 sm:flex-row sm:items-center">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Timezone</FormLabel>
                        <FormDescription>
                          Timezone for your deadlines.
                        </FormDescription>
                      </div>
                      <FormControl className="mt-2 sm:mt-0 w-[180px]">
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={updateSettings.isPending}>
                  {updateSettings.isPending ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Preferences
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
