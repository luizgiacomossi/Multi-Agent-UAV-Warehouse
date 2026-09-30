import { runAllocationTests } from './test_allocation';
import { runPathPlanningTests } from './test_path_planning';
import { runBenchmarkTests } from './test_benchmark';

const startTime = performance.now();

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║       MULTI-DRONE PATH PLANNING & ALLOCATION TEST SUITE    ║');
console.log('╚════════════════════════════════════════════════════════════╝');

const allocationResults = runAllocationTests();
const planningResults = runPathPlanningTests();
const benchmarkResults = await runBenchmarkTests();

const totalPassed = allocationResults.passed + planningResults.passed + benchmarkResults.passed;
const totalFailed = allocationResults.failed + planningResults.failed + benchmarkResults.failed;
const totalDuration = ((performance.now() - startTime) / 1000).toFixed(2);

console.log('\n========================================');
console.log('📊 TEST SUMMARY RESULTS');
console.log('========================================');
console.log(`  Total Passed:  ${totalPassed}`);
console.log(`  Total Failed:  ${totalFailed}`);
console.log(`  Total Tests:   ${totalPassed + totalFailed}`);
console.log(`  Duration:      ${totalDuration}s`);

if (totalFailed === 0) {
  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! Everything is operational.');
  process.exit(0);
} else {
  console.error(`\n❌ ${totalFailed} TEST(S) FAILED.`);
  process.exit(1);
}
