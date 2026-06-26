import { savedSearchesRepository } from "../repositories/savedSearches.repository";

export const savedSearchesService = {
  async list(clerkId: string) {
    return savedSearchesRepository.findAll(clerkId);
  },

  async create(clerkId: string, data: { name: string; filters: Record<string, unknown> }) {
    return savedSearchesRepository.create({
      clerkId,
      name: data.name,
      filters: data.filters,
    });
  },

  async delete(id: string, clerkId: string) {
    return savedSearchesRepository.delete(id, clerkId);
  },
};
