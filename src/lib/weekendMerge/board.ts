// Lay uploaded files out as a day × session grid for the UI: one row per
// settlement day, four slots (8am, 11am, 2pm, 5pm) per row. Makes merge order,
// gaps and duplicates visible at a glance. Only Saturday and Sunday need all
// four; an empty slot on any other day is "optional", not "missing".

import { SESSION_LABELS, type SessionLabel } from "../session/nibbsSession.ts";
import { toDdmmyyyy } from "../format.ts";
import { isWeekend, type SessionNo, type SourceFile } from "./sourceFile.ts";
import type { HolidayLookup, PublicHoliday } from "../holidays/parseIcs.ts";
import { holidayFor } from "./holidays.ts";

export type SlotState = "ok" | "warn" | "fail" | "missing" | "optional" | "duplicate";

export interface BoardSlot {
  session: SessionNo;
  label: SessionLabel;
  /** Name the file for this slot must have. */
  expectedName: string;
  files: SourceFile[];
  state: SlotState;
}

export interface BoardDay {
  date: Date;
  weekend: boolean;
  /** All four sessions are required (Saturday and Sunday only). */
  required: boolean;
  /** Set when the date is a Nigerian public holiday on the calendar. */
  holiday?: PublicHoliday;
  slots: BoardSlot[];
  filled: number;
}

export interface SessionBoard {
  days: BoardDay[];
  /** Files that cannot be placed on the grid (bad name or date). */
  unplaced: SourceFile[];
}

function slotState(files: SourceFile[], required: boolean): SlotState {
  if (files.length === 0) return required ? "missing" : "optional";
  if (files.length > 1) return "duplicate";
  const f = files[0];
  if (!f.valid) return "fail";
  return f.issues.length > 0 ? "warn" : "ok";
}

export function buildSessionBoard(sources: SourceFile[], holidays: HolidayLookup = () => undefined): SessionBoard {
  const byDay = new Map<number, SourceFile[]>();
  const unplaced: SourceFile[] = [];
  for (const f of sources) {
    if (!f.date || !f.session) {
      unplaced.push(f);
      continue;
    }
    const k = f.date.getTime();
    byDay.set(k, [...(byDay.get(k) ?? []), f]);
  }

  const days = [...byDay.keys()]
    .sort((a, b) => a - b)
    .map((k): BoardDay => {
      const date = new Date(k);
      const files = byDay.get(k) ?? [];
      const weekend = isWeekend(date);
      const slots = SESSION_LABELS.map((label, i): BoardSlot => {
        const session = (i + 1) as SessionNo;
        const here = files.filter((f) => f.session === session);
        return {
          session,
          label,
          expectedName: `ETRANZACT_${toDdmmyyyy(date)}_${session}.txt`,
          files: here,
          state: slotState(here, weekend),
        };
      });
      return {
        date,
        weekend,
        required: weekend,
        holiday: holidayFor(date, holidays),
        slots,
        filled: slots.filter((s) => s.files.length > 0).length,
      };
    });

  return { days, unplaced };
}
