import {
  db,
  companiesTable,
  jobSourcesTable,
  jobsTable,
} from "@workspace/db";
import { logger } from "../lib/logger";

async function main() {
  logger.info("Seeding Jobs domain...");

  // ─── Job Sources ─────────────────────────────────────────────────────────────

  const sources = await db
    .insert(jobSourcesTable)
    .values([
      {
        name: "LinkedIn",
        baseUrl: "https://linkedin.com/jobs",
        logoUrl: "https://cdn.simpleicons.org/linkedin/0A66C2",
        isActive: true,
      },
      {
        name: "Internshala",
        baseUrl: "https://internshala.com",
        logoUrl: "https://cdn.simpleicons.org/internshala/059669",
        isActive: true,
      },
      {
        name: "Unstop",
        baseUrl: "https://unstop.com",
        logoUrl: null,
        isActive: true,
      },
    ])
    .onConflictDoNothing()
    .returning();

  logger.info({ count: sources.length }, "Job sources seeded");

  // ─── Companies ───────────────────────────────────────────────────────────────

  const companies = await db
    .insert(companiesTable)
    .values([
      {
        name: "Google",
        slug: "google",
        logoUrl: "https://cdn.simpleicons.org/google/4285F4",
        website: "https://google.com",
        industry: "Technology",
        description:
          "Google LLC is an American multinational technology company focusing on AI, search, cloud computing, and software.",
        headquarters: "Mountain View, CA",
        size: "enterprise",
        type: "product",
        linkedinUrl: "https://linkedin.com/company/google",
      },
      {
        name: "Microsoft",
        slug: "microsoft",
        logoUrl: "https://cdn.simpleicons.org/microsoft/00A4EF",
        website: "https://microsoft.com",
        industry: "Technology",
        description:
          "Microsoft Corporation develops, licenses, and supports software, services, devices and solutions worldwide.",
        headquarters: "Redmond, WA",
        size: "enterprise",
        type: "product",
        linkedinUrl: "https://linkedin.com/company/microsoft",
      },
      {
        name: "Flipkart",
        slug: "flipkart",
        logoUrl: "https://cdn.simpleicons.org/flipkart/F74F29",
        website: "https://flipkart.com",
        industry: "E-Commerce",
        description:
          "Flipkart is India's leading e-commerce marketplace offering electronics, fashion, home essentials, and more.",
        headquarters: "Bengaluru, India",
        size: "enterprise",
        type: "product",
        linkedinUrl: "https://linkedin.com/company/flipkart",
      },
      {
        name: "Swiggy",
        slug: "swiggy",
        logoUrl: "https://cdn.simpleicons.org/swiggy/FC8019",
        website: "https://swiggy.com",
        industry: "Food & Logistics",
        description:
          "Swiggy is India's leading on-demand delivery platform connecting consumers with restaurants and stores.",
        headquarters: "Bengaluru, India",
        size: "large",
        type: "product",
        linkedinUrl: "https://linkedin.com/company/swiggy-in",
      },
      {
        name: "Zomato",
        slug: "zomato",
        logoUrl: "https://cdn.simpleicons.org/zomato/E23744",
        website: "https://zomato.com",
        industry: "Food & Logistics",
        description:
          "Zomato is a global restaurant discovery and food delivery platform operating across 25+ countries.",
        headquarters: "Gurugram, India",
        size: "large",
        type: "product",
        linkedinUrl: "https://linkedin.com/company/zomato",
      },
      {
        name: "Razorpay",
        slug: "razorpay",
        logoUrl: "https://cdn.simpleicons.org/razorpay/3395FF",
        website: "https://razorpay.com",
        industry: "Fintech",
        description:
          "Razorpay is a full-stack financial services company providing payment solutions to Indian businesses.",
        headquarters: "Bengaluru, India",
        size: "medium",
        type: "product",
        linkedinUrl: "https://linkedin.com/company/razorpay",
      },
      {
        name: "Adobe",
        slug: "adobe",
        logoUrl: "https://cdn.simpleicons.org/adobe/FF0000",
        website: "https://adobe.com",
        industry: "Technology",
        description:
          "Adobe Inc. is an American multinational computer software company known for creative and document cloud products.",
        headquarters: "San Jose, CA",
        size: "enterprise",
        type: "product",
        linkedinUrl: "https://linkedin.com/company/adobe",
      },
      {
        name: "Atlassian",
        slug: "atlassian",
        logoUrl: "https://cdn.simpleicons.org/atlassian/0052CC",
        website: "https://atlassian.com",
        industry: "Technology",
        description:
          "Atlassian builds tools for team collaboration including Jira, Confluence, and Trello.",
        headquarters: "Sydney, Australia",
        size: "large",
        type: "product",
        linkedinUrl: "https://linkedin.com/company/atlassian",
      },
    ])
    .onConflictDoNothing()
    .returning();

  logger.info({ count: companies.length }, "Companies seeded");

  if (companies.length === 0) {
    logger.info("Seed data already exists, skipping jobs");
    return;
  }

  const bySlug = Object.fromEntries(companies.map((c) => [c.slug, c]));
  const now = new Date();
  const future = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    return d;
  };
  const past = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    return d;
  };

  // ─── Jobs ─────────────────────────────────────────────────────────────────────

  const jobs = await db
    .insert(jobsTable)
    .values([
      // Google
      {
        companyId: bySlug["google"].id,
        title: "Software Engineering Intern",
        department: "Engineering",
        location: "Bengaluru",
        country: "India",
        workMode: "hybrid",
        jobType: "internship",
        stipend: 90000,
        currency: "INR",
        eligibleBatch: [2026, 2027],
        eligibleBranches: ["CSE", "IT", "ECE", "EEE"],
        minCgpa: 7.5,
        requiredSkills: ["Data Structures", "Algorithms", "C++", "Python", "System Design"],
        deadline: future(14),
        applyUrl: "https://careers.google.com",
        sourcePlatform: "LinkedIn",
        postedDate: past(3),
        status: "active",
        description:
          "Join Google as a Software Engineering Intern and work on real-world problems at scale. You'll be matched to a team based on your skills and interests.",
        requirements:
          "Currently enrolled in a B.Tech/M.Tech program in CS or related field. Strong problem-solving skills and knowledge of algorithms and data structures.",
        benefits: ["Competitive stipend", "Accommodation assistance", "Mentorship from senior engineers", "Return offer potential"],
        selectionProcess: "Online coding test → Technical phone screen → 2 virtual interviews",
      },
      {
        companyId: bySlug["google"].id,
        title: "Software Engineer (New Grad)",
        department: "Engineering",
        location: "Hyderabad",
        country: "India",
        workMode: "hybrid",
        jobType: "full_time",
        salaryMin: 2000000,
        salaryMax: 2800000,
        currency: "INR",
        eligibleBatch: [2025],
        eligibleBranches: ["CSE", "IT", "ECE"],
        minCgpa: 8.0,
        requiredSkills: ["Algorithms", "Data Structures", "Distributed Systems", "Go", "Java", "Python"],
        deadline: future(21),
        applyUrl: "https://careers.google.com",
        sourcePlatform: "LinkedIn",
        postedDate: past(5),
        status: "active",
        description:
          "Google is looking for new grad Software Engineers to join our Hyderabad campus. You will be part of a team that builds systems powering billions of users.",
        requirements:
          "B.Tech/M.Tech/PhD in Computer Science or related field (2025 grad). Outstanding problem-solving skills and passion for building scalable software.",
        benefits: ["Health insurance", "Generous PTO", "Learning & development budget", "Google perks"],
        selectionProcess: "Resume screen → Online assessment → 5 technical interviews",
      },

      // Microsoft
      {
        companyId: bySlug["microsoft"].id,
        title: "Software Engineering Intern – Azure",
        department: "Cloud + AI",
        location: "Hyderabad",
        country: "India",
        workMode: "hybrid",
        jobType: "internship",
        stipend: 80000,
        currency: "INR",
        eligibleBatch: [2026, 2027],
        eligibleBranches: ["CSE", "IT", "ECE", "EEE", "Mathematics & Computing"],
        minCgpa: 7.0,
        requiredSkills: ["C#", "Azure", "Distributed Systems", "REST APIs", "Problem Solving"],
        deadline: future(7),
        applyUrl: "https://careers.microsoft.com",
        sourcePlatform: "LinkedIn",
        postedDate: past(8),
        status: "active",
        description:
          "Work on Azure's core infrastructure serving millions of enterprise customers. You'll design, implement, and ship features used globally.",
        requirements:
          "Pursuing B.Tech/M.Tech in CSE or related discipline. Passion for cloud computing and distributed systems.",
        benefits: ["Competitive stipend", "Housing allowance", "Microsoft 365 license", "Full-time conversion opportunity"],
        selectionProcess: "Online coding test → HR screen → 2 technical interviews",
      },
      {
        companyId: bySlug["microsoft"].id,
        title: "Full Stack Developer (FTE)",
        department: "Microsoft 365",
        location: "Bengaluru",
        country: "India",
        workMode: "hybrid",
        jobType: "full_time",
        salaryMin: 1800000,
        salaryMax: 2400000,
        currency: "INR",
        eligibleBatch: [2025],
        eligibleBranches: ["CSE", "IT"],
        minCgpa: 7.5,
        requiredSkills: ["TypeScript", "React", "Node.js", "Azure", "REST APIs", "SQL"],
        deadline: future(30),
        applyUrl: "https://careers.microsoft.com",
        sourcePlatform: "LinkedIn",
        postedDate: past(2),
        status: "active",
        description:
          "Build the next generation of Microsoft 365 productivity tools. You'll work across the stack from client-side React applications to cloud-native backend services.",
        requirements:
          "Fresh graduates with strong knowledge of React and Node.js. Experience with TypeScript is a plus.",
        benefits: ["Comprehensive health coverage", "Employee stock purchase plan", "Gym & wellness allowance"],
        selectionProcess: "Resume shortlist → Online test → 3 rounds (2 coding + 1 HM)",
      },

      // Flipkart
      {
        companyId: bySlug["flipkart"].id,
        title: "SDE 1 – Backend",
        department: "Platform Engineering",
        location: "Bengaluru",
        country: "India",
        workMode: "onsite",
        jobType: "full_time",
        salaryMin: 1500000,
        salaryMax: 2000000,
        currency: "INR",
        eligibleBatch: [2025],
        eligibleBranches: ["CSE", "IT", "ECE"],
        minCgpa: 7.0,
        requiredSkills: ["Java", "Spring Boot", "Microservices", "Kafka", "MySQL", "Redis"],
        deadline: future(10),
        applyUrl: "https://flipkartcareers.com",
        sourcePlatform: "LinkedIn",
        postedDate: past(4),
        status: "active",
        description:
          "Join Flipkart's Platform Engineering team and build systems that power India's largest e-commerce platform. You'll work on highly scalable, low-latency backend services.",
        requirements:
          "B.Tech 2025 graduate with strong fundamentals in Java and system design. Experience with microservices architecture preferred.",
        benefits: ["Stock options (ESOPs)", "Health & accident insurance", "Flexible hours", "Food coupons"],
        selectionProcess: "Online test (DSA) → Technical interview 1 → Technical interview 2 → HR",
      },
      {
        companyId: bySlug["flipkart"].id,
        title: "SDE Intern – Supply Chain",
        department: "Supply Chain",
        location: "Bengaluru",
        country: "India",
        workMode: "onsite",
        jobType: "internship",
        stipend: 70000,
        currency: "INR",
        eligibleBatch: [2026],
        eligibleBranches: ["CSE", "IT", "Mathematics & Computing"],
        minCgpa: 7.5,
        requiredSkills: ["Data Structures", "Algorithms", "Python", "SQL"],
        deadline: future(5),
        applyUrl: "https://flipkartcareers.com",
        sourcePlatform: "Unstop",
        postedDate: past(10),
        status: "active",
        description:
          "2-month internship working on Flipkart's supply chain optimization systems. Real ownership, real impact.",
        requirements: "Pre-final year B.Tech student with strong DSA skills.",
        benefits: ["Competitive stipend", "PPO for top performers", "Mentorship"],
        selectionProcess: "Coding test → 1 technical interview",
      },

      // Swiggy
      {
        companyId: bySlug["swiggy"].id,
        title: "Backend Engineering Intern",
        department: "Payments",
        location: "Bengaluru",
        country: "India",
        workMode: "hybrid",
        jobType: "internship",
        stipend: 65000,
        currency: "INR",
        eligibleBatch: [2026, 2027],
        eligibleBranches: ["CSE", "IT", "ECE", "EEE"],
        minCgpa: 6.5,
        requiredSkills: ["Go", "Python", "PostgreSQL", "Kafka", "REST APIs"],
        deadline: future(18),
        applyUrl: "https://careers.swiggy.com",
        sourcePlatform: "LinkedIn",
        postedDate: past(1),
        status: "active",
        description:
          "Work on Swiggy's payments infrastructure processing millions of transactions daily. You'll build features used by 40M+ customers.",
        requirements:
          "Pre-final or final year student. Familiarity with one backend language (Go, Python, Java).",
        benefits: ["Free Swiggy credits", "Stipend", "Flexible hours", "PPO opportunity"],
        selectionProcess: "Online coding test → 2 technical rounds",
      },
      {
        companyId: bySlug["swiggy"].id,
        title: "SDE 1 – Instamart Platform",
        department: "Instamart",
        location: "Bengaluru",
        country: "India",
        workMode: "hybrid",
        jobType: "full_time",
        salaryMin: 1400000,
        salaryMax: 1800000,
        currency: "INR",
        eligibleBatch: [2025],
        eligibleBranches: ["CSE", "IT"],
        requiredSkills: ["Go", "gRPC", "Kubernetes", "PostgreSQL", "Redis"],
        deadline: future(25),
        applyUrl: "https://careers.swiggy.com",
        sourcePlatform: "LinkedIn",
        postedDate: past(6),
        status: "active",
        description:
          "Build the Instamart platform that delivers groceries in 10 minutes. You'll work on inventory, catalog, and order management systems.",
        requirements:
          "Fresh 2025 graduate with strong CS fundamentals. Experience with distributed systems is a plus.",
        benefits: ["ESOPs", "Health coverage", "Swiggy One membership", "Annual learning budget"],
        selectionProcess: "Resume screen → Coding test → 3 technical interviews → HR",
      },

      // Zomato
      {
        companyId: bySlug["zomato"].id,
        title: "Frontend Intern – Consumer App",
        department: "Consumer",
        location: "Gurugram",
        country: "India",
        workMode: "onsite",
        jobType: "internship",
        stipend: 60000,
        currency: "INR",
        eligibleBatch: [2026, 2027],
        eligibleBranches: ["CSE", "IT"],
        minCgpa: 7.0,
        requiredSkills: ["React", "TypeScript", "Next.js", "CSS", "Redux"],
        deadline: future(12),
        applyUrl: "https://careers.zomato.com",
        sourcePlatform: "LinkedIn",
        postedDate: past(7),
        status: "active",
        description:
          "Build the user-facing features of Zomato's consumer app used by millions daily. Work alongside senior engineers on A/B experiments and new product features.",
        requirements:
          "Pre-final year student with hands-on React/TypeScript experience. Portfolio of web projects preferred.",
        benefits: ["Stipend", "Zomato Gold subscription", "Mentorship", "PPO potential"],
        selectionProcess: "Portfolio review → Take-home assignment → 2 technical interviews",
      },
      {
        companyId: bySlug["zomato"].id,
        title: "Software Engineer – Hyperpure",
        department: "Hyperpure",
        location: "Bengaluru",
        country: "India",
        workMode: "hybrid",
        jobType: "full_time",
        salaryMin: 1300000,
        salaryMax: 1700000,
        currency: "INR",
        eligibleBatch: [2025],
        eligibleBranches: ["CSE", "IT", "ECE"],
        minCgpa: 7.0,
        requiredSkills: ["Python", "Django", "PostgreSQL", "Redis", "AWS", "Celery"],
        deadline: future(35),
        applyUrl: "https://careers.zomato.com",
        sourcePlatform: "Unstop",
        postedDate: past(12),
        status: "active",
        description:
          "Zomato Hyperpure is building India's largest food supply chain. Join us to build backend systems for B2B procurement at scale.",
        requirements: "2025 graduate in CSE/IT with strong Python and SQL skills.",
        benefits: ["ESOPs", "Health insurance", "Learning stipend", "Food allowance"],
        selectionProcess: "Coding test → Technical interview → Manager round",
      },

      // Razorpay
      {
        companyId: bySlug["razorpay"].id,
        title: "Software Development Engineer – Payments",
        department: "Payments Core",
        location: "Bengaluru",
        country: "India",
        workMode: "hybrid",
        jobType: "full_time",
        salaryMin: 1600000,
        salaryMax: 2200000,
        currency: "INR",
        eligibleBatch: [2025],
        eligibleBranches: ["CSE", "IT", "Mathematics & Computing"],
        minCgpa: 7.5,
        requiredSkills: ["Java", "Go", "Microservices", "MySQL", "Kafka", "AWS"],
        deadline: future(20),
        applyUrl: "https://razorpay.com/jobs",
        sourcePlatform: "LinkedIn",
        postedDate: past(3),
        status: "active",
        description:
          "Work on India's leading payments infrastructure handling ₹10L+ crore in annual payment volume. Build fault-tolerant, high-throughput systems.",
        requirements:
          "2025 B.Tech graduate with excellent DSA and system design fundamentals.",
        benefits: ["Competitive CTC + ESOPs", "Flexible work", "Insurance", "Unlimited PTO"],
        selectionProcess: "Coding round → System design → 2 technical interviews → Culture fit",
      },

      // Adobe
      {
        companyId: bySlug["adobe"].id,
        title: "Research Engineer Intern – Firefly AI",
        department: "Digital Experience",
        location: "Noida",
        country: "India",
        workMode: "hybrid",
        jobType: "internship",
        stipend: 100000,
        currency: "INR",
        eligibleBatch: [2026, 2027],
        eligibleBranches: ["CSE", "AI/ML", "Mathematics & Computing"],
        minCgpa: 8.0,
        requiredSkills: ["Python", "PyTorch", "Computer Vision", "LLMs", "ML Research"],
        deadline: future(9),
        applyUrl: "https://adobe.com/careers",
        sourcePlatform: "LinkedIn",
        postedDate: past(2),
        status: "active",
        description:
          "Intern with Adobe's Firefly AI team to push the boundaries of generative AI for creative professionals. Publish research, build prototypes, and influence product.",
        requirements:
          "Pre-final year student with strong ML fundamentals and ideally prior research experience or publications.",
        benefits: ["Highest-tier stipend", "Adobe CC license", "Research mentor", "Relocation support"],
        selectionProcess: "Resume + research statement → Technical interview → Research presentation",
      },

      // Atlassian
      {
        companyId: bySlug["atlassian"].id,
        title: "Software Engineer – Jira Platform",
        department: "Jira",
        location: "Bengaluru",
        country: "India",
        workMode: "remote",
        jobType: "full_time",
        salaryMin: 2200000,
        salaryMax: 3000000,
        currency: "INR",
        eligibleBatch: [2025],
        eligibleBranches: ["CSE", "IT"],
        minCgpa: 7.5,
        requiredSkills: ["Java", "TypeScript", "React", "GraphQL", "AWS", "Distributed Systems"],
        deadline: future(28),
        applyUrl: "https://atlassian.com/company/careers",
        sourcePlatform: "LinkedIn",
        postedDate: past(1),
        status: "active",
        description:
          "Build the core Jira platform that 250,000+ companies rely on for project management. Fully remote-first team with engineering excellence culture.",
        requirements:
          "2025 graduate with strong full-stack skills and a passion for developer tooling.",
        benefits: ["Top-of-market comp", "Annual $1000 learning budget", "Remote-first culture", "Team rituals budget"],
        selectionProcess: "Take-home project → 3 technical rounds → Value interview",
      },
    ])
    .returning();

  logger.info({ count: jobs.length }, "Jobs seeded");
  logger.info("Seed complete.");
}

main().catch((err) => {
  logger.error({ err }, "Seed failed");
  process.exit(1);
});
