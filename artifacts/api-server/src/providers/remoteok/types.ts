/** RemoteOK public API response shapes (https://remoteok.com/api). */

/** The API's first array element is legal/metadata, not a job. */
export interface RemoteOkMeta {
  legal?: string;
  [key: string]: unknown;
}

export interface RemoteOkJob {
  id: string;
  company: string;
  company_logo?: string;
  position: string;
  /** HTML description. */
  description?: string;
  location?: string;
  tags?: string[];
  url: string;
  apply_url?: string;
  /** ISO date string. */
  date?: string;
  salary_min?: number;
  salary_max?: number;
}

/** Raw response is a JSON array: [meta, ...jobs]. */
export type RemoteOkResponse = Array<RemoteOkMeta | RemoteOkJob>;
