// Checks across the whole set of uploaded session files: duplicates, missing
// sessions and gaps between days. These decide whether a merge is allowed.

import type { CheckResult } from "../reconcile.ts";
import { dayDiff, toSlashDate } from "../format.ts";
import { SESSION_LABELS } from "../session/nibbsSession.ts";
import { isWeekend, weekdayName, type SourceFile } from "./sourceFile.ts";
import { sortSources } from "./merge.ts";

function dayLabel(d: Date): string {
  return `${weekdayName(d).slice(0, 3)} ${toSlashDate(d)}`;
}

export interface CollectionOptions {
  /**
   * The user chose to merge even though some sessions are missing (e.g. a
   * session NIBBS never ran). Missing sessions are then a warning, not a block.
   */
  allowMissingSessions?: boolean;
}

/** Id of the check that an explicit "merge anyway" can downgrade. */
export const MISSING_SESSIONS_CHECK = "sessions-complete";

export function assessCollection(files: SourceFile[], options: CollectionOptions = {}): CheckResult[] {
  if (files.length === 0) return [];
  const checks: CheckResult[] = [];
  const sorted = sortSources(files);

  const invalid = sorted.filter((f) => !f.valid);
  checks.push({
    id: "files-valid",
    label: "Every file passes upload checks",
    status: invalid.length === 0 ? "pass" : "fail",
    detail:
      invalid.length === 0
        ? `${files.length} file(s): names, record template, row dates and net = 0 all correct.`
        : `${invalid.length} file(s) rejected: ${invalid.map((f) => f.name).join(", ")}. Fix or remove them to merge.`,
  });

  // Group dated files by day.
  const byDay = new Map<number, SourceFile[]>();
  for (const f of sorted) {
    if (!f.date || !f.session) continue;
    const k = f.date.getTime();
    byDay.set(k, [...(byDay.get(k) ?? []), f]);
  }

  const dupes: string[] = [];
  const missing: string[] = [];
  for (const [k, dayFiles] of byDay) {
    const d = new Date(k);
    const seen = new Map<number, number>();
    for (const f of dayFiles) seen.set(f.session as number, (seen.get(f.session as number) ?? 0) + 1);
    for (const [s, n] of seen) if (n > 1) dupes.push(`${dayLabel(d)} session ${s} ×${n}`);
    const absent = [1, 2, 3, 4].filter((s) => !seen.has(s));
    if (absent.length > 0) {
      missing.push(`${dayLabel(d)}: ${absent.map((s) => `_${s} (${SESSION_LABELS[s - 1]})`).join(", ")}`);
    }
  }

  checks.push({
    id: "duplicates",
    label: "No duplicate sessions",
    status: dupes.length === 0 ? "pass" : "fail",
    detail: dupes.length === 0 ? "Each day/session appears once." : `Uploaded more than once: ${dupes.join("; ")}.`,
  });

  checks.push({
    id: MISSING_SESSIONS_CHECK,
    label: "All 4 sessions for every day",
    status:
      byDay.size === 0
        ? "fail"
        : missing.length === 0
          ? "pass"
          : options.allowMissingSessions
            ? "warn"
            : "fail",
    detail:
      byDay.size === 0
        ? "No correctly named files yet."
        : missing.length === 0
          ? `${byDay.size} day(s), 8am → 5pm complete for each.`
          : options.allowMissingSessions
            ? `Merging without: ${missing.join("; ")}.`
            : `Missing: ${missing.join("; ")}.`,
  });

  const days = [...byDay.keys()].sort((a, b) => a - b).map((k) => new Date(k));
  const gaps: string[] = [];
  for (let i = 1; i < days.length; i++) {
    if (dayDiff(days[i - 1], days[i]) > 1) gaps.push(`${dayLabel(days[i - 1])} → ${dayLabel(days[i])}`);
  }
  checks.push({
    id: "contiguous",
    label: "Days are consecutive",
    status: gaps.length === 0 ? "pass" : "warn",
    detail:
      gaps.length === 0
        ? days.length > 0
          ? `${days.map(dayLabel).join(", ")}.`
          : "No dated files yet."
        : `Gap between ${gaps.join("; ")}. Confirm no settlement day is missing.`,
  });

  const weekdays = days.filter((d) => !isWeekend(d));
  checks.push({
    id: "non-business-days",
    label: "Only weekends / holidays",
    status: weekdays.length === 0 ? "pass" : "warn",
    detail:
      weekdays.length === 0
        ? "Every file is dated Saturday or Sunday."
        : `${weekdays.map(dayLabel).join(", ")} ${weekdays.length === 1 ? "is a weekday" : "are weekdays"}. Confirm each is a public holiday.`,
  });

  return checks;
}

/** A merge may proceed only when no collection check fails. */
export function canMerge(checks: CheckResult[]): boolean {
  return checks.length > 0 && !checks.some((c) => c.status === "fail");
}
