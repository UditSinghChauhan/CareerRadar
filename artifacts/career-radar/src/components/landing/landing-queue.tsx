import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  getGetDailyQueueQueryKey,
  type DailyQueue,
} from "@workspace/api-client-react";
import { TodaysQueue } from "@/components/dashboard/todays-queue";
import { TooltipProvider } from "@/components/ui/tooltip";
import illustrative from "./illustrative-queue.json";

/**
 * The committed illustrative queue. Its companies and titles are invented;
 * every score and reason line was produced by the API's own scoring code
 * (api-server/src/queue/priority.ts), and api-server's
 * illustrative-queue.test.ts fails if they drift from it. The JSON matches
 * the DailyQueue contract field for field, with three extra provenance keys.
 */
export const ILLUSTRATIVE_QUEUE = illustrative as unknown as DailyQueue & {
  illustrative: true;
  source: string;
  date: string;
};

export type QueueState = { skip?: number; applied?: number; limit?: number };

/**
 * The app's real Today's Queue, fed from a local query cache so it never
 * touches the network. The landing shows it as a demonstration: the frame is
 * inert, so Apply and Dismiss are not reachable or clickable here.
 */
export function LandingQueue({
  skip = 0,
  applied = 0,
  limit = 10,
}: QueueState) {
  const [client] = useState(() => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: Infinity,
          gcTime: Infinity,
          retry: false,
          refetchOnWindowFocus: false,
          refetchOnMount: false,
        },
      },
    });
    qc.setQueryData(getGetDailyQueueQueryKey(), {
      ...ILLUSTRATIVE_QUEUE,
      items: ILLUSTRATIVE_QUEUE.items.slice(skip, skip + limit),
      progress: { ...ILLUSTRATIVE_QUEUE.progress, appliedToday: applied },
    });
    return qc;
  });

  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <TodaysQueue />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
