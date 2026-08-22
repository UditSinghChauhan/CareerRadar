import { Router } from "express";
import { companiesService } from "../services/companies.service";
import { CreateCompanyBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

router.get("/companies", async (req, res) => {
  try {
    const result = await companiesService.list(req.query, req.query);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to list companies");
    res.status(500).json({ error: "Failed to list companies" });
  }
});

router.post("/companies", requireAuth, async (req, res) => {
  const parsed = CreateCompanyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const company = await companiesService.create(parsed.data);
    res.status(201).json(company);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("already exists")) {
      res.status(409).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "Failed to create company");
    res.status(500).json({ error: "Failed to create company" });
  }
});

router.get("/companies/:id", async (req, res) => {
  try {
    const company = await companiesService.get(req.params.id);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    res.json(company);
  } catch (err) {
    req.log.error({ err }, "Failed to get company");
    res.status(500).json({ error: "Failed to get company" });
  }
});

export default router;
