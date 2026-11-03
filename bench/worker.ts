/** Child process of runScenarios: runs each scenario it is sent and replies with its records. */
import { runScenario } from './runScenario';
import { ScenarioJob, ScenarioResult } from './parallel';

process.on('message', async ({ index, scenario, plan }: ScenarioJob) => {
  const records = await runScenario(scenario, plan);
  process.send!({ index, records } satisfies ScenarioResult);
});
