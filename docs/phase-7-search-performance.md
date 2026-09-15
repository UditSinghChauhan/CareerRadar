# Phase 7 — search and performance, measured

Every plan below was captured with `EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)` against the
**production Neon database** on 2026-09-15, not against the thirteen-row local one, because at
thirteen rows every plan is a sequential scan and every timing is noise. The table held **4,074
active** and 480 closed postings across **1,515 companies**. Each statement was run twice and the
second run recorded, so the numbers compare warm cache with warm cache.

The migration is `lib/db/sql/2026-09-15-phase-7-search-perf.sql`.

---

## 1. The default feed — `jobs_status_relevance_posted_idx`

The Jobs page's default order is `relevance_score DESC NULLS LAST, posted_date DESC,
created_at DESC`, filtered to `status = 'active'`.

### Before

```
Limit (actual time=3.811..3.817 rows=20.00 loops=1)
  Buffers: shared hit=728
  ->  Sort (actual time=3.806..3.810 rows=20.00 loops=1)
        Sort Key: j.relevance_score DESC NULLS LAST, j.posted_date DESC, j.created_at DESC
        Sort Method: top-N heapsort  Memory: 27kB
        ->  Hash Join (actual time=0.373..3.220 rows=4074.00 loops=1)
              ->  Seq Scan on jobs j (actual time=0.019..2.110 rows=4074.00 loops=1)
                    Filter: (status = 'active'::job_status)
                    Rows Removed by Filter: 480
Execution Time: 3.879 ms
```

Every active row was read and sorted to produce twenty.

### After

```
Limit (actual time=0.030..0.106 rows=20.00 loops=1)
  Buffers: shared hit=66
  ->  Nested Loop (actual time=0.029..0.103 rows=20.00 loops=1)
        ->  Index Scan using jobs_status_relevance_posted_idx on jobs j
              (actual time=0.012..0.040 rows=20.00 loops=1)
              Index Cond: (status = 'active'::job_status)
        ->  Memoize (actual time=0.002..0.002 rows=1.00 loops=20)
              ->  Index Only Scan using companies_pkey on companies c
Execution Time: 0.150 ms
```

**3.879 ms → 0.150 ms, 728 buffers → 66.** No sort node at all: the rows come off the index in
order.

The NULLS placement in the index declaration is load-bearing. Postgres only uses an index to
satisfy an `ORDER BY` when the null placement of every key matches, `ORDER BY x DESC` means NULLS
FIRST, and Drizzle's `.desc()` on an *index* column emits NULLS LAST. The index therefore spells
all four placements out to match `orderBy()` in `jobs.repository.ts` exactly. Changing either side
alone both reorders the live feed and silently drops back to the plan above.

### What this did not fix

A deep page is still a sequential scan — the planner decides that walking 3,020 index entries and
fetching their heap rows costs more than scanning and sorting:

```
-- OFFSET 3000, after
Limit (actual time=4.771..4.777 rows=20.00 loops=1)   Execution Time: 4.875 ms
  ->  Sort ... Sort Method: quicksort  Memory: 383kB
        ->  Hash Join -> Seq Scan on jobs j
```

Before it was 5.486 ms, so nothing regressed; it simply is not where the index helps. Deep pages
are rare enough that keyset pagination was not worth the API change.

---

## 2. Search — `search_vector` and `jobs_search_vector_idx`

Pre-Phase-7 the predicate was `jobs.title ILIKE '%q%' OR companies.name ILIKE '%q%'`.

### Before — count for "kubernetes"

```
Aggregate (actual time=5.018..5.021 rows=1.00 loops=1)
  Buffers: shared hit=849
  ->  Hash Join (actual time=4.776..5.014 rows=1.00 loops=1)
        Join Filter: ((j.title ~~* '%kubernetes%') OR (c.name ~~* '%kubernetes%'))
        Rows Removed by Join Filter: 4073
        ->  Seq Scan on jobs j (rows=4074.00)
Execution Time: 5.180 ms
```

**One** match, because only the title was searched.

### The first attempt, which was slower — keep this

The natural way to write the new predicate keeps the company arm as a subquery:

```sql
j.search_vector @@ websearch_to_tsquery('english', $1)
OR j.search_vector @@ to_tsquery('english', $2)
OR j.company_id IN (SELECT id FROM companies WHERE name ILIKE $3)
```

```
Aggregate (actual time=19.446..19.449 rows=1.00 loops=1)
  Buffers: shared hit=12271
  ->  Hash Join
        ->  Seq Scan on jobs j (actual time=0.570..18.945 rows=73.00 loops=1)
              Filter: (... OR (ANY (company_id = (hashed SubPlan 1).col1)))
              Rows Removed by Filter: 4481
Execution Time: 19.502 ms
```

**19.5 ms and 12,252 buffers — four times slower than the ILIKE it replaced**, and the GIN index
is not used at all. Postgres will not build a `BitmapOr` across a hashed subplan, so the whole
predicate falls back to a sequential scan, and on every row it walks it has to detoast
`search_vector`. That is where the twelve thousand buffers come from.

### After — company ids resolved in a separate round trip

`jobsRepository.findAll` runs one small query first (`SELECT id FROM companies WHERE name ILIKE $1`,
a scan of 1,515 rows costing 19 buffers) and passes the result as an array, which makes every arm a
condition on `jobs` alone:

```
Aggregate (actual time=0.762..0.774 rows=1.00 loops=1)
  Buffers: shared hit=106
  ->  Hash Join (rows=73.00)
        ->  Bitmap Heap Scan on jobs j (actual time=0.078..0.345 rows=73.00 loops=1)
              Recheck Cond: ((search_vector @@ '''kubernet''')
                          OR (search_vector @@ '''kubernet'':*')
                          OR (company_id = ANY ('{...}'::uuid[])))
              ->  BitmapOr (actual time=0.056..0.056)
                    ->  Bitmap Index Scan on jobs_search_vector_idx (rows=85.00)
                    ->  Bitmap Index Scan on jobs_search_vector_idx (rows=87.00)
                    ->  Bitmap Index Scan on jobs_company_id_idx
Execution Time: 0.970 ms
```

**5.180 ms → 0.970 ms, 849 buffers → 106 — and 73 matches instead of 1**, because the description,
requirements and required skills are searched now, not only the title. The page-one `SELECT` for
the same query is 0.638 ms against 5.561 ms before.

---

## 3. Is the new predicate a superset of the old one?

A faster search that quietly stops finding things is not an improvement. Run against production for
sixteen realistic queries — how many rows the old `ILIKE` predicate matched that the new one does
**not**:

| intern | backend | frontend | python | sde | data | remote | google | amazon | java | react | devops | analyst | trainee | graduate | fresher |
| ------ | ------- | -------- | ------ | --- | ---- | ------ | ------ | ------ | ---- | ----- | ------ | ------- | ------- | -------- | ------- |
| 0      | 0       | 0        | 0      | 0   | 0    | 0      | 0      | 0      | 0    | 0     | 0      | 0       | 0       | 0        | 0       |

Two things were needed to get there, and both were found by measuring rather than by reasoning:

1. **Prefix matching.** `intern` stems to `intern` and `Internship` to `internship`; they do not
   match. The second tsquery arm (`intern:*`) restores what `ILIKE '%intern%'` used to find. It is
   dropped when the query uses websearch syntax — a flat AND of every word would otherwise undo a
   `-negation` or an explicit `or`.
2. **Slash normalisation.** Postgres's default parser reads `Developer/intern` as a single `file`
   token, so it never yields an `intern` lexeme. Eight active production postings titled `…/Intern`
   were invisible to a search for "intern" until `replace(x, '/', ' ')` was added to every arm of
   the generated column. For an internship tracker, exactly the wrong eight.

Below three characters the predicate falls back to the pre-Phase-7 `ILIKE`, as UPGRADE.md §7 asks.

---

## 4. Cost of the change

- `search_vector` is `GENERATED ALWAYS ... STORED`, so Postgres maintains it on every insert and
  update. There is no trigger and no backfill, and adding it filled all 4,554 existing rows.
- Two new indexes on `jobs` (one GIN, one four-column btree) are two more structures for the sync
  to maintain on write. The sync writes a few hundred rows every six hours; the Jobs page is read
  on every visit.
- Applying the migration to Neon took 6.2 seconds end to end, including the table rewrite.
