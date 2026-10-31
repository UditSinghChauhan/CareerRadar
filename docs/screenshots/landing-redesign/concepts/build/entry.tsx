/**
 * Browser bundle for the landing concepts. Mounts the app's real
 * TodaysQueue component with a pre-seeded query cache (no network), and
 * exposes the real radar point field from radar-field.tsx.
 */
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getGetDailyQueueQueryKey } from "@workspace/api-client-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TodaysQueue } from "@/components/dashboard/todays-queue";
import { buildField, RADAR_COUNTS } from "@/components/landing/radar-field";
import queue from "../assets/queue.illustrative.json";

type MountOptions = { limit?: number; applied?: number; skip?: number };

function mountQueue(el: HTMLElement, opts: MountOptions = {}) {
  const { limit = 10, applied = 0, skip = 0 } = opts;
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });
  client.setQueryData(getGetDailyQueueQueryKey(), {
    ...queue,
    items: queue.items.slice(skip, skip + limit),
    progress: { ...queue.progress, appliedToday: applied },
  });
  createRoot(el).render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <TodaysQueue />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

declare global {
  interface Window {
    CR: {
      mountQueue: typeof mountQueue;
      field: ReturnType<typeof buildField>;
      counts: typeof RADAR_COUNTS;
      queue: typeof queue;
    };
  }
}

window.CR = { mountQueue, field: buildField(), counts: RADAR_COUNTS, queue };
document.dispatchEvent(new Event("cr:ready"));
