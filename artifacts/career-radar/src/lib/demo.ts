import { toast } from "sonner";
import { getGetDemoQueryKey, useGetDemo } from "@workspace/api-client-react";

/**
 * The read-only demo (api-server/src/demo/demo.ts). The server refuses
 * every write from the demo account with 403 `demo_read_only`; the app
 * only explains that, once, instead of reporting a failure.
 */
export function isDemoReadOnly(err: unknown): boolean {
  // The shape of the API client's ApiError: { status, data }.
  if (typeof err !== "object" || err === null) return false;
  const { status, data } = err as { status?: unknown; data?: unknown };
  return (
    status === 403 &&
    typeof data === "object" &&
    data !== null &&
    (data as { error?: unknown }).error === "demo_read_only"
  );
}

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
export const SIGN_UP_FROM_DEMO = `${basePath}/sign-up`;

/** One toast, however many writes were refused: sonner replaces by id. */
export function showDemoReadOnlyToast(onSignUp: () => void) {
  toast("This demo is read-only", {
    id: "demo-read-only",
    description: "Create a free account to save, apply and track your own.",
    action: { label: "Sign up", onClick: onSignUp },
  });
}

/** Whether a demo exists, and whether this session is the demo account. */
export function useDemoStatus() {
  const { data, isPending } = useGetDemo({
    query: {
      queryKey: getGetDemoQueryKey(),
      staleTime: Infinity,
      retry: false,
    },
  });
  return {
    enabled: data?.enabled ?? false,
    active: data?.active ?? false,
    /** False until the server has answered; redirects wait for it. */
    known: !isPending,
  };
}
