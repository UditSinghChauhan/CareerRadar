/** Greenhouse public Boards API response shapes. */

export interface GreenhouseJobLocation {
  name: string;
}

export interface GreenhouseDepartment {
  id: number;
  name: string;
  parent_id: number | null;
  child_ids: number[];
}

export interface GreenhouseJob {
  id: number;
  title: string;
  updated_at: string;
  location: GreenhouseJobLocation;
  departments: GreenhouseDepartment[];
  /** Present when ?content=true is passed. */
  content?: string;
  absolute_url: string;
  metadata?: Array<{ id: number; name: string; value: string | null }>;
}

export interface GreenhouseBoardResponse {
  jobs: GreenhouseJob[];
  meta: {
    total: number;
  };
}
