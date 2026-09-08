/**
 * Structured, greppable logging for the keeper.
 *
 * The keeper runs unattended on a schedule, so the log is the only artefact of
 * a run. Every line carries the run id and the subscription it concerns, which
 * is what makes "why did delegator X not get paid last Monday" answerable from
 * `grep` alone rather than from a re-run.
 */
export type Level = "info" | "warn" | "error";

export type LogFields = Record<string, string | number | boolean | null | undefined>;

export function createLogger(runId: string) {
  const started = Date.now();

  const emit = (level: Level, message: string, fields?: LogFields) => {
    const line = {
      ts: new Date().toISOString(),
      level,
      run: runId,
      ms: Date.now() - started,
      msg: message,
      ...fields,
    };
    // One JSON object per line: readable in a terminal, parseable by whatever
    // ships the logs, and it survives Vercel's log viewer intact.
    const text = JSON.stringify(line);
    if (level === "error") console.error(text);
    else if (level === "warn") console.warn(text);
    else console.log(text);
  };

  return {
    info: (m: string, f?: LogFields) => emit("info", m, f),
    warn: (m: string, f?: LogFields) => emit("warn", m, f),
    error: (m: string, f?: LogFields) => emit("error", m, f),
    elapsed: () => Date.now() - started,
  };
}

export type Logger = ReturnType<typeof createLogger>;
