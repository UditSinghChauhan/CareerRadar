import {
  companiesRepository,
  type CompanyFilters,
} from "../repositories/companies.repository";
import { paginate, type PaginationParams } from "../lib/pagination";

export const companiesService = {
  async list(rawFilters: Record<string, unknown>, rawPagination: Record<string, unknown>) {
    const filters: CompanyFilters = {
      search: rawFilters.search as string | undefined,
      industry: rawFilters.industry as string | undefined,
    };
    const pagination = paginate(rawPagination);
    return companiesRepository.findAll(filters, pagination);
  },

  async get(id: string) {
    const company = await companiesRepository.findById(id);
    if (!company) return null;
    return company;
  },

  async create(data: {
    name: string;
    slug: string;
    logoUrl?: string;
    website?: string;
    industry?: string;
    description?: string;
    headquarters?: string;
    size?: "startup" | "small" | "medium" | "large" | "enterprise";
    type?: "product" | "service" | "consulting" | "startup";
    linkedinUrl?: string;
  }) {
    const exists = await companiesRepository.existsBySlug(data.slug);
    if (exists) {
      throw new Error(`Company with slug "${data.slug}" already exists`);
    }
    return companiesRepository.create(data);
  },
};
