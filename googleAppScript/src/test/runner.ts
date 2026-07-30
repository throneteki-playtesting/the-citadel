import { Log } from "../cloudLogger";

interface Test {
  name: string;
  fn: () => void;
}
const tests: { [key: string]: Test[] } = {};

let current = null;
export function testGroup(name: string, block: () => void) {
    current = name;
    tests[current] = [];
    block();
    current = null;
}

export function test(name: string, fn: () => void)
{
    tests[current].push({ name, fn });
}

export function run() {
    Log.supress = true;

    let passed = 0;

    const totalGroups = Object.keys(tests).length;
    const totalTests = Object.values(tests).flat().length;

    Log.write(`Found ${totalGroups} groups with a total of ${totalTests} test(s)...\n`);

    for (const [gName, gTests] of Object.entries(tests)) {
        Log.write(`Running ${gTests.length} test(s) for: ${gName} ...`);
        for (const { name, fn } of gTests) {
            try {
                fn();
                Log.write(`✅ PASS: ${name}`);
                passed++;
            } catch (err) {
                Log.write(`❌ FAIL: ${name}`);
                Log.write(`   → ${(err as Error).message}`);
            }
        }
    }

    let message = "Testing Complete!\n\n";
    if (passed === totalTests) {
        message += "🟢 ";
    } else if (passed > 0) {
        message += "🟠 ";
    } else {
        message += "🔴 ";
    }
    message += `${passed} tests passed`;
    Log.write(message);

    Log.supress = false;
}