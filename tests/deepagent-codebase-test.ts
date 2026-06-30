/**
 * DeepAgent Codebase Access Test Suite
 * 
 * Tests all 7 tool categories of the DeepAgent filesystem backend:
 * 1. File Reading - Read configuration files, source code, multiple files
 * 2. File Listing - List directories (root and nested)
 * 3. Glob Pattern Matching - Find TypeScript files, API routes, test files
 * 4. Content Search - Search for functions, patterns, configurations
 * 5. File Writing - Create new files, config files
 * 6. File Editing - Add lines, replace text, remove lines
 * 7. Shell Execution - Run simple commands, check versions, list processes
 */

import { createDeepAgentInstance } from '@/lib/deepagent/backend';

interface TestCase {
  category: string;
  prompt: string;
  expected: string;
}

const testCases: TestCase[] = [
  // ============================================
  // Category 1: File Reading (3 tests)
  // ============================================
  {
    category: 'File Reading',
    prompt: 'Read the package.json file and list the top 5 dependencies',
    expected: 'Should return package.json contents with dependencies like next, react, prisma, deepagents, typescript',
  },
  {
    category: 'File Reading',
    prompt: 'Read src/lib/deepagent/backend.ts and explain what createDeepAgentInstance does',
    expected: 'Should read the backend.ts file and explain it creates a DeepAgent with FilesystemBackend',
  },
  {
    category: 'File Reading',
    prompt: 'Read both src/lib/deepagent/types.ts and src/lib/deepagent/stream-handler.ts, then summarize their purposes',
    expected: 'Should read both files and explain types.ts defines message/session types while stream-handler.ts handles SSE streaming',
  },

  // ============================================
  // Category 2: File Listing (3 tests)
  // ============================================
  {
    category: 'File Listing',
    prompt: 'List all files and directories in the root directory',
    expected: 'Should list root directory contents including src/, prisma/, package.json, tsconfig.json, etc.',
  },
  {
    category: 'File Listing',
    prompt: 'List all files in src/lib/deepagent/ directory',
    expected: 'Should list backend.ts, stream-handler.ts, and types.ts',
  },
  {
    category: 'File Listing',
    prompt: 'List all subdirectories in src/app/api/v1/admin/',
    expected: 'Should list admin API route directories like deepagent/, users/, analytics/, etc.',
  },

  // ============================================
  // Category 3: Glob Pattern Matching (3 tests)
  // ============================================
  {
    category: 'Glob Pattern Matching',
    prompt: 'Find all TypeScript files in src/lib/ai/ using glob pattern **/*.ts',
    expected: 'Should find TypeScript files like provider.ts, confidence.ts, prompts.ts, types.ts',
  },
  {
    category: 'Glob Pattern Matching',
    prompt: 'Find all API route files using pattern src/app/api/**/route.ts',
    expected: 'Should find route.ts files in API directories like signals, articles, companies, admin',
  },
  {
    category: 'Glob Pattern Matching',
    prompt: 'Find all test files using pattern **/*.test.ts',
    expected: 'Should find test files if they exist, or report no matches',
  },

  // ============================================
  // Category 4: Content Search (4 tests)
  // ============================================
  {
    category: 'Content Search',
    prompt: 'Search for the function "createDeepAgentInstance" across the codebase',
    expected: 'Should find the function definition in src/lib/deepagent/backend.ts',
  },
  {
    category: 'Content Search',
    prompt: 'Search for all files that import from "@/lib/auth"',
    expected: 'Should find multiple files importing auth helper like API routes and middleware',
  },
  {
    category: 'Content Search',
    prompt: 'Search for "FilesystemBackend" usage in the codebase',
    expected: 'Should find it used in src/lib/deepagent/backend.ts',
  },
  {
    category: 'Content Search',
    prompt: 'Search for all Prisma model names in prisma/schema.prisma',
    expected: 'Should find model definitions like User, Company, Signal, Analysis, Article, etc.',
  },

  // ============================================
  // Category 5: File Writing (3 tests)
  // ============================================
  {
    category: 'File Writing',
    prompt: 'Create a new file at tests/test-output/sample.txt with the content "Hello from DeepAgent test"',
    expected: 'Should create the file successfully with the specified content',
  },
  {
    category: 'File Writing',
    prompt: 'Create a TypeScript utility file at tests/test-output/utils.ts with a simple add function',
    expected: 'Should create a TypeScript file with export function add(a: number, b: number): number',
  },
  {
    category: 'File Writing',
    prompt: 'Create a JSON config file at tests/test-output/config.json with test settings',
    expected: 'Should create a valid JSON file with configuration object',
  },

  // ============================================
  // Category 6: File Editing (4 tests)
  // ============================================
  {
    category: 'File Editing',
    prompt: 'Edit tests/test-output/sample.txt and append a new line "Second line added"',
    expected: 'Should append the new line to the existing file content',
  },
  {
    category: 'File Editing',
    prompt: 'Edit tests/test-output/utils.ts and add a new function called subtract after the add function',
    expected: 'Should add the subtract function while preserving the add function',
  },
  {
    category: 'File Editing',
    prompt: 'Edit tests/test-output/config.json and add a new property "version": "1.0.0"',
    expected: 'Should add the version property to the JSON object',
  },
  {
    category: 'File Editing',
    prompt: 'Remove the first line from tests/test-output/sample.txt',
    expected: 'Should remove "Hello from DeepAgent test" and keep only "Second line added"',
  },

  // ============================================
  // Category 7: Shell Execution (4 tests)
  // ============================================
  {
    category: 'Shell Execution',
    prompt: 'Run the command "node --version" to check Node.js version',
    expected: 'Should return the Node.js version number like v20.x.x or v22.x.x',
  },
  {
    category: 'Shell Execution',
    prompt: 'Run "pnpm --version" to check pnpm package manager version',
    expected: 'Should return the pnpm version number',
  },
  {
    category: 'Shell Execution',
    prompt: 'Run "Get-Process | Select-Object -First 5" to list first 5 running processes',
    expected: 'Should list 5 running processes with their names and PIDs',
  },
  {
    category: 'Shell Execution',
    prompt: 'Run "Get-Location" to show current working directory',
    expected: 'Should return the project root directory path',
  },
];

interface TestResult {
  category: string;
  prompt: string;
  expected: string;
  success: boolean;
  result?: string;
  error?: string;
}

async function runTests() {
  console.log('='.repeat(80));
  console.log('DeepAgent Codebase Access Test Suite');
  console.log('='.repeat(80));
  console.log(`Total test cases: ${testCases.length}`);
  console.log('='.repeat(80));

  const agent = await createDeepAgentInstance();
  const results: TestResult[] = [];

  for (let i = 0; i < testCases.length; i++) {
    const test = testCases[i];
    console.log(`\n[${i + 1}/${testCases.length}] Testing: ${test.category}`);
    console.log(`Prompt: ${test.prompt}`);
    console.log(`Expected: ${test.expected}`);

    try {
      const result = await agent.invoke({
        messages: [{ role: 'user', content: test.prompt }],
      });

      const lastMessage = result.messages.at(-1);
      const rawContent = lastMessage?.content ?? 'No response';
      const resultContent = typeof rawContent === 'string'
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent.map((block) => (typeof block === 'string' ? block : (block as { text?: string }).text ?? '')).join('')
          : String(rawContent);

      console.log('Result:', resultContent.substring(0, 200) + (resultContent.length > 200 ? '...' : ''));
      console.log('Status: ✓ PASS');

      results.push({
        category: test.category,
        prompt: test.prompt,
        expected: test.expected,
        success: true,
        result: resultContent,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Error:', errorMessage);
      console.error('Status: ✗ FAIL');

      results.push({
        category: test.category,
        prompt: test.prompt,
        expected: test.expected,
        success: false,
        error: errorMessage,
      });
    }
  }

  // Summary report
  console.log('\n' + '='.repeat(80));
  console.log('Test Summary');
  console.log('='.repeat(80));

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`Total: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`);

  console.log('\n' + '='.repeat(80));
  console.log('Results by Category');
  console.log('='.repeat(80));

  const categories = Array.from(new Set(results.map((r) => r.category)));
  for (const category of categories) {
    const categoryResults = results.filter((r) => r.category === category);
    const categoryPassed = categoryResults.filter((r) => r.success).length;
    console.log(`${category}: ${categoryPassed}/${categoryResults.length} passed`);
  }

  if (failed > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('Failed Tests');
    console.log('='.repeat(80));
    for (const result of results.filter((r) => !r.success)) {
      console.log(`\nCategory: ${result.category}`);
      console.log(`Prompt: ${result.prompt}`);
      console.log(`Error: ${result.error}`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('Test suite completed');
  console.log('='.repeat(80));

  return results;
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests()
    .then((results) => {
      const failed = results.filter((r) => !r.success).length;
      process.exit(failed > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { runTests, testCases };
export type { TestCase, TestResult };
