/**
 * Runs the scenarios of a plan, one after another or spread over child processes.
 *
 * Every scenario is independent and seeded, and each process has its own random source, so the
 * mission metrics do not depend on the number of workers. Records come back in scenario order,
 * so runs.csv is the same file either way. Only planningMs changes, since parallel runs share the
 * machine: measure planning time with one worker.
 */
import { fork } from 'child_process';
import { availableParallelism } from 'os';
import { fileURLToPath } from 'url';
import { BenchmarkPlan, ScenarioSpec } from './scenarios';
import { RunRecord, runScenario } from './runScenario';

export type ScenarioJob = { index: number; scenario: ScenarioSpec; plan: BenchmarkPlan };
export type ScenarioResult = { index: number; records: RunRecord[] };

/** Default worker count: the cores minus one, so the machine stays usable. */
export const defaultWorkers = () => Math.max(1, availableParallelism() - 1);

export async function runScenarios(
  scenarios: ScenarioSpec[],
  plan: BenchmarkPlan,
  workers = 1,
  onScenarioDone: (done: number) => void = () => {},
): Promise<RunRecord[]> {
  if (workers <= 1 || scenarios.length <= 1) {
    const records: RunRecord[] = [];
    for (const [index, scenario] of scenarios.entries()) {
      records.push(...await runScenario(scenario, plan));
      onScenarioDone(index + 1);
    }
    return records;
  }

  const results: RunRecord[][] = new Array(scenarios.length);
  const workerFile = fileURLToPath(new URL('./worker.ts', import.meta.url));
  let next = 0;
  let done = 0;

  // structured-clone serialization keeps Infinity (instant charging), which JSON would turn into null
  const runWorker = () => new Promise<void>((resolve, reject) => {
    const child = fork(workerFile, [], { execArgv: ['--import', 'tsx'], serialization: 'advanced', stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
    const send = () => {
      if (next >= scenarios.length) { child.disconnect(); return; }
      const index = next++;
      child.send({ index, scenario: scenarios[index], plan } satisfies ScenarioJob);
    };
    child.on('message', ({ index, records }: ScenarioResult) => {
      results[index] = records;
      onScenarioDone(++done);
      send();
    });
    child.on('error', reject);
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`benchmark worker exited with code ${code}`))));
    send();
  });

  await Promise.all(Array.from({ length: Math.min(workers, scenarios.length) }, runWorker));
  return results.flat();
}
