import { bookmarksRepository } from "../repositories/bookmarks.repository";
import { jobsRepository } from "../repositories/jobs.repository";

export const bookmarksService = {
  async list(clerkId: string) {
    return bookmarksRepository.findAll(clerkId);
  },

  async add(clerkId: string, jobId: string) {
    const job = await jobsRepository.findById(jobId);
    if (!job) throw new Error(`Job "${jobId}" not found`);

    const existing = await bookmarksRepository.findByJobId(clerkId, jobId);
    if (existing) throw new Error("Job is already bookmarked");

    return bookmarksRepository.create(clerkId, jobId);
  },

  async remove(clerkId: string, jobId: string) {
    return bookmarksRepository.delete(clerkId, jobId);
  },
};
