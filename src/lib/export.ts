import type { Task } from "./types";

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function taskSeconds(t: Task): number {
  return (t.timeEntries ?? []).reduce((s, e) => s + (e.seconds || 0), 0);
}

/** Billable hours export: one row per task that has tracked time + a total. */
export function exportTimeCSV(projectName: string, tasks: Task[]) {
  const rows = tasks
    .map((t) => ({ t, secs: taskSeconds(t) }))
    .filter((r) => r.secs > 0)
    .sort((a, b) => b.secs - a.secs);

  const header = ["Project", "Task", "Status", "Priority", "Hours"];
  const lines = [header.map(csvCell).join(",")];
  let total = 0;
  for (const { t, secs } of rows) {
    total += secs;
    lines.push(
      [projectName, t.title, t.status, t.priority, (secs / 3600).toFixed(2)].map(csvCell).join(",")
    );
  }
  lines.push(["", "TOTAL", "", "", (total / 3600).toFixed(2)].map(csvCell).join(","));

  const stamp = new Date().toISOString().slice(0, 10);
  download(
    `${projectName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-time-${stamp}.csv`,
    lines.join("\n"),
    "text/csv;charset=utf-8"
  );
}
