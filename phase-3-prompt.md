# Phase 3 Prompt: Simplify PrintRepository for MVP

## Objective
Simplify the PrintRepository by reducing the state machine complexity that is not essential for MVP. Remove attempt tracking and non-critical timestamps while preserving the core print job flow (enqueue → printing → completed/failed).

## Scope
- **Simplify:** `server/utils/print/repository.ts` — reduce state machine to MVP essentials
- **Remove:** `attempts` counter tracking from all methods
- **Remove:** `startedAt` timestamp from markJobPrinting and completeJob
- **Remove:** `lastError` tracking from failJob
- **Simplify:** retryJob — remove attempts decrement logic
- **Simplify:** cleanupOldJobs — remove complex status filtering
- **Maintain:** RLS `withTenant()` wrapping (essential)
- **Maintain:** Core methods: registerPrinter, getPrinters, enqueuePrintJob, getPendingJobs

## Specific Tasks

### 1. markJobPrinting (simplified)
- Remove: `attempts: sql"${printJob.attempts} + 1"`
- Remove: `startedAt: new Date()`
- Keep: status transition pending → printing, pending-only guard

### 2. completeJob (simplified)
- Remove: attempts reset to 0
- Keep: status → completed, completedAt timestamp

### 3. failJob (simplified)
- Remove: lastError field tracking
- Keep: status → failed

### 4. retryJob (simplified)
- Remove: attempts decrement or reset logic
- Keep: status → pending (simple reset)

### 5. cleanupOldJobs (simplified)
- Remove: sql`${printJob.status} IN ('completed', 'failed')` filter
- Keep: delete by age (olderThanDays) alone

### 6. Other methods kept as-is or minimally adjusted
- registerPrinter — kept unchanged
- getPrinters — kept unchanged  
- enqueuePrintJob — kept unchanged
- getPendingJobs — kept unchanged

## Validation Checklist
- [ ] `POST /api/print/jobs` enqueues job with status pending
- [ ] `POST /api/print/jobs/[id]/retry` resets job to pending
- [ ] `POST /api/print/jobs/[id]/complete` marks job completed
- [ ] `POST /api/print/jobs/[id]/fail` marks job failed
- [ ] Task `process-print-queue` processes jobs (may need minor adjustment if it previously relied on attempts field)
- [ ] `GET /api/print/jobs/pending` returns pending jobs

## Rollback Plan
- Restore original `print.repository.ts` from git
- All methods have identical names/signatures; rollback = file replacement
- The `attempts`, `startedAt`, `lastError` fields return on print jobs

## Performance Impact
- Small improvement: fewer SQL columns updated per job status change
- No change to core enqueue or pending-fetch performance