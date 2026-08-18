import { describe, expect, it } from "vitest";
import type { Task } from "../types";
import { reconcileTaskProjection } from "./taskProjection";

function makeTask(
  id: number,
  fields: Partial<Task> = {},
): Task {
  return {
    id,
    title: `Task ${id}`,
    notes: null,
    status: "planned",
    planned_date: "2026-08-20",
    scheduled_start: null,
    estimate_minutes: null,
    actual_minutes: 0,
    sort_order: id,
    created_at: "2026-08-18T00:00:00.000Z",
    completed_at: null,
    timer_started_at: null,
    priority: 0,
    tags: null,
    ...fields,
  };
}

describe("reconcileTaskProjection", () => {
  const selectedDate = "2026-08-19";
  const today = "2026-08-18";

  it("updates a future week task with canonical derived counts", () => {
    const id = 41;
    const previous = makeTask(id, {
      planned_date: "2026-08-20",
      subtask_total: 0,
      subtask_done: 0,
      attachment_count: 0,
    });
    const canonical = makeTask(id, {
      planned_date: "2026-08-20",
      subtask_total: 3,
      subtask_done: 2,
      attachment_count: 1,
    });

    const next = reconcileTaskProjection({
      selectedDate,
      todayKey: today,
      taskId: id,
      task: canonical,
      dayTasks: [],
      backlog: [],
      carryOver: [],
      weekTasks: {
        "2026-08-19": [],
        "2026-08-20": [previous],
      },
    });

    expect(next.weekTasks["2026-08-20"]).toHaveLength(1);
    expect(next.weekTasks["2026-08-20"][0].subtask_total).toBe(3);
    expect(next.weekTasks["2026-08-20"][0].subtask_done).toBe(2);
    expect(next.weekTasks["2026-08-20"][0].attachment_count).toBe(1);
  });

  it("relocates a carried-over task to selected day and clears old bucket", () => {
    const id = 51;
    const old = makeTask(id, {
      planned_date: "2026-08-16",
      status: "planned",
      sort_order: 9,
    });
    const canonical = makeTask(id, {
      planned_date: selectedDate,
      status: "planned",
      sort_order: 1,
    });
    const sameDayOther = makeTask(7, {
      planned_date: selectedDate,
      sort_order: 3,
    });

    const next = reconcileTaskProjection({
      selectedDate,
      todayKey: today,
      taskId: id,
      task: canonical,
      dayTasks: [sameDayOther],
      backlog: [],
      carryOver: [old],
      weekTasks: {
        [selectedDate]: [sameDayOther],
        "2026-08-16": [old],
      },
    });

    expect(next.carryOver.find((t) => t.id === id)).toBeUndefined();
    expect(next.weekTasks["2026-08-16"].find((t) => t.id === id)).toBeUndefined();
    expect(next.dayTasks.map((t) => t.id)).toEqual([id, 7]);
    expect(next.weekTasks[selectedDate].map((t) => t.id)).toEqual([id, 7]);
  });

  it("removes done tasks from carry-over while keeping them in loaded week day", () => {
    const id = 61;
    const openTask = makeTask(id, {
      planned_date: "2026-08-17",
      status: "planned",
    });
    const canonicalDone = makeTask(id, {
      planned_date: "2026-08-17",
      status: "done",
      completed_at: "2026-08-18T11:00:00.000Z",
    });

    const next = reconcileTaskProjection({
      selectedDate,
      todayKey: today,
      taskId: id,
      task: canonicalDone,
      dayTasks: [],
      backlog: [],
      carryOver: [openTask],
      weekTasks: {
        "2026-08-17": [openTask],
      },
    });

    expect(next.carryOver).toHaveLength(0);
    expect(next.weekTasks["2026-08-17"]).toHaveLength(1);
    expect(next.weekTasks["2026-08-17"][0].status).toBe("done");
  });

  it("removes a deleted task from every projection", () => {
    const id = 77;
    const row = makeTask(id, { planned_date: selectedDate });

    const next = reconcileTaskProjection({
      selectedDate,
      todayKey: today,
      taskId: id,
      task: undefined,
      dayTasks: [row],
      backlog: [makeTask(2, { planned_date: null, status: "backlog" })],
      carryOver: [makeTask(3, { planned_date: "2026-08-17" })],
      weekTasks: {
        [selectedDate]: [row],
        "2026-08-20": [makeTask(88)],
      },
    });

    expect(next.dayTasks.find((t) => t.id === id)).toBeUndefined();
    expect(next.backlog.find((t) => t.id === id)).toBeUndefined();
    expect(next.carryOver.find((t) => t.id === id)).toBeUndefined();
    expect(next.weekTasks[selectedDate].find((t) => t.id === id)).toBeUndefined();
  });
});