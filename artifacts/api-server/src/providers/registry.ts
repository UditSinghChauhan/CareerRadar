/**
 * ProviderRegistry
 * ─────────────────
 * Central lookup table for all registered job providers.
 *
 * REGISTERING A NEW PROVIDER
 * ───────────────────────────
 * 1. Import the provider instance at the bottom of this file.
 * 2. Call `providerRegistry.register(instance)`.
 *
 * The scheduler and routes automatically discover all registered providers.
 */

import type { JobProvider } from "./types";
import { logger } from "../lib/logger";

export class ProviderRegistry {
  private providers = new Map<string, JobProvider>();

  register(provider: JobProvider): void {
    if (this.providers.has(provider.name)) {
      logger.warn({ name: provider.name }, "Provider already registered — overwriting");
    }
    this.providers.set(provider.name, provider);
    logger.info(
      { name: provider.name, hasPublicApi: provider.hasPublicApi },
      `Registered provider: ${provider.displayName}`,
    );
  }

  get(name: string): JobProvider | undefined {
    return this.providers.get(name);
  }

  getAll(): JobProvider[] {
    return Array.from(this.providers.values());
  }

  list(): Array<{ name: string; displayName: string; hasPublicApi: boolean }> {
    return this.getAll().map(({ name, displayName, hasPublicApi }) => ({
      name,
      displayName,
      hasPublicApi,
    }));
  }

  has(name: string): boolean {
    return this.providers.has(name);
  }
}

/** Singleton registry — import this everywhere you need provider lookup. */
export const providerRegistry = new ProviderRegistry();

// ─── Register all providers ───────────────────────────────────────────────────
// Import order does not matter — registry is keyed by provider.name.

import greenhouseProvider from "./greenhouse/provider";
import leverProvider from "./lever/provider";
import ashbyProvider from "./ashby/provider";
import wellfoundProvider from "./wellfound/provider";
import internshalaProvider from "./internshala/provider";
import unstopProvider from "./unstop/provider";
import { SmartRecruitersProvider } from "./company-careers/provider";
import workdayProvider from "./workday/provider";

providerRegistry.register(greenhouseProvider);
providerRegistry.register(leverProvider);
providerRegistry.register(ashbyProvider);
providerRegistry.register(wellfoundProvider);
providerRegistry.register(internshalaProvider);
providerRegistry.register(unstopProvider);
providerRegistry.register(new SmartRecruitersProvider());
providerRegistry.register(workdayProvider);
