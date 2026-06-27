/**
 * In-memory metrics store for the provider engine.
 *
 * Data is reset on server restart. For persistence, swap the Map for a
 * DB-backed implementation using the metrics table (future work).
 */

export interface ProviderRunMetrics {
  providerName: string;
  companySlug: string;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  totalRuns: number;
  successCount: number;
  failureCount: number;
  totalJobsFetched: number;
  totalJobsInserted: number;
  totalJobsUpdated: number;
  totalJobsSkipped: number;
  lastError: string | null;
}

export interface SchedulerMetrics {
  totalSchedulerRuns: number;
  lastSchedulerRunAt: Date | null;
  nextSchedulerRunAt: Date | null;
  isRunning: boolean;
}

class MetricsStore {
  private providerMetrics = new Map<string, ProviderRunMetrics>();
  private schedulerMetrics: SchedulerMetrics = {
    totalSchedulerRuns: 0,
    lastSchedulerRunAt: null,
    nextSchedulerRunAt: null,
    isRunning: false,
  };

  private key(providerName: string, companySlug: string): string {
    return `${providerName}:${companySlug}`;
  }

  private getOrCreate(providerName: string, companySlug: string): ProviderRunMetrics {
    const k = this.key(providerName, companySlug);
    if (!this.providerMetrics.has(k)) {
      this.providerMetrics.set(k, {
        providerName,
        companySlug,
        lastRunAt: null,
        lastSuccessAt: null,
        totalRuns: 0,
        successCount: 0,
        failureCount: 0,
        totalJobsFetched: 0,
        totalJobsInserted: 0,
        totalJobsUpdated: 0,
        totalJobsSkipped: 0,
        lastError: null,
      });
    }
    return this.providerMetrics.get(k)!;
  }

  recordSuccess(
    providerName: string,
    companySlug: string,
    jobsFetched: number,
    jobsInserted: number,
    jobsUpdated: number,
    jobsSkipped: number,
  ): void {
    const m = this.getOrCreate(providerName, companySlug);
    const now = new Date();
    m.lastRunAt = now;
    m.lastSuccessAt = now;
    m.totalRuns++;
    m.successCount++;
    m.totalJobsFetched += jobsFetched;
    m.totalJobsInserted += jobsInserted;
    m.totalJobsUpdated += jobsUpdated;
    m.totalJobsSkipped += jobsSkipped;
    m.lastError = null;
  }

  recordFailure(providerName: string, companySlug: string, error: string): void {
    const m = this.getOrCreate(providerName, companySlug);
    m.lastRunAt = new Date();
    m.totalRuns++;
    m.failureCount++;
    m.lastError = error;
  }

  recordSchedulerStart(): void {
    this.schedulerMetrics.isRunning = true;
  }

  recordSchedulerEnd(nextRunAt: Date): void {
    this.schedulerMetrics.isRunning = false;
    this.schedulerMetrics.lastSchedulerRunAt = new Date();
    this.schedulerMetrics.nextSchedulerRunAt = nextRunAt;
    this.schedulerMetrics.totalSchedulerRuns++;
  }

  setNextRun(nextRunAt: Date): void {
    this.schedulerMetrics.nextSchedulerRunAt = nextRunAt;
  }

  getAllProviderMetrics(): ProviderRunMetrics[] {
    return Array.from(this.providerMetrics.values());
  }

  getSchedulerMetrics(): SchedulerMetrics {
    return { ...this.schedulerMetrics };
  }

  getSummary() {
    return {
      scheduler: this.getSchedulerMetrics(),
      providers: this.getAllProviderMetrics(),
    };
  }
}

/** Singleton metrics store — import and use anywhere in the provider engine. */
export const metrics = new MetricsStore();
