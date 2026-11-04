import {
  getGetDailyQueueQueryKey,
  getGetProfileQueryKey,
  useUpdateProfile,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Preferences } from "./preferences-form";

/**
 * Saves the onboarding answer and drops the cached profile and queue, so the
 * next screen ranks against the new answer instead of yesterday's cache.
 */
export function useSavePreferences() {
  const queryClient = useQueryClient();
  const update = useUpdateProfile();
  const save = (value: Preferences, onDone: () => void) =>
    update.mutate(
      {
        data: { rolePreference: value.role, preferredLocations: value.places },
      },
      {
        onSuccess: async (profile) => {
          queryClient.setQueryData(getGetProfileQueryKey(), profile);
          await queryClient.invalidateQueries({
            queryKey: getGetDailyQueueQueryKey().slice(0, 1),
          });
          onDone();
        },
      },
    );
  return {
    save,
    pending: update.isPending,
    error: update.isError
      ? "Could not save your choices. Check your connection and try again."
      : null,
  };
}
