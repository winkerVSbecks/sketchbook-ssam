import Random from 'canvas-sketch-util/random';

// Common file extensions in web projects
const extensions = [
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.css',
  '.scss',
  '.vue',
  '.svelte',
];

// Common NPM packages
const packages = [
  'react',
  'react-dom',
  'lodash',
  'axios',
  'express',
  'moment',
  'styled-components',
  'redux',
  'vue',
  'svelte',
  '@material-ui/core',
  'tailwindcss',
  '@emotion/react',
  'next',
  'webpack',
  'eslint',
  'babel-core',
  'typescript',
  'jest',
  'postcss',
  'core-js',
  'zod',
  'zustand',
  'framer-motion',
];

// Common folders in projects
const folders = [
  'src',
  'components',
  'utils',
  'helpers',
  'hooks',
  'pages',
  'services',
  'api',
  'models',
  'store',
  'assets',
  'styles',
  'layouts',
  'context',
  'lib',
];

/**
 * Generates realistic mock logs that resemble JavaScript build tools
 */
export function generateMockBuildLogs({
  tool = 'random',
  entryCount = 20,
  showErrors = true,
  showWarnings = true,
}: {
  tool?: 'webpack' | 'rollup' | 'vite' | 'npm' | 'random';
  entryCount?: number;
  showErrors?: boolean;
  showWarnings?: boolean;
} = {}): string[] {
  // Choose a random tool if 'random' is specified
  const buildTool =
    tool === 'random'
      ? Random.pick(['webpack', 'rollup', 'vite', 'npm'])
      : tool;

  // Generate random file paths
  const generateFilePath = (): string => {
    const depth = Random.rangeFloor(1, 4); // 1-3 levels deep
    let path = '';

    for (let i = 0; i < depth; i++) {
      const folderName =
        i === 0
          ? Random.pick(folders)
          : Random.pick(['components', 'utils', 'modules', 'features']);
      path += folderName + '/';
    }

    const fileNames = [
      'index',
      'main',
      'App',
      'utils',
      'helpers',
      'Button',
      'Card',
      'Modal',
      'Form',
      'Table',
      'List',
      'Item',
      'Container',
      'Layout',
      'Header',
      'Footer',
      'Sidebar',
      'Navigation',
      'Auth',
      'User',
      'Dashboard',
      'Home',
      'Profile',
    ];

    const fileName = Random.pick(fileNames);
    const ext = Random.pick(extensions);
    return path + fileName + ext;
  };

  // Generate random chunk names
  const generateChunkName = (): string => {
    const prefixes = [
      'main',
      'vendor',
      'chunk',
      'bundle',
      'app',
      'common',
      'shared',
    ];
    const prefix = Random.pick(prefixes);
    const hash = Random.value().toString(36).substring(2, 8); // 6 character random string

    return `${prefix}-${hash}`;
  };

  // Generate file sizes
  const generateFileSize = (min = 1, max = 1000): string => {
    const size = Random.rangeFloor(min, max + 1);

    if (size < 1024) {
      return `${size} B`;
    } else if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(2)} KB`;
    } else {
      return `${(size / (1024 * 1024)).toFixed(2)} MB`;
    }
  };

  // Generate build times
  const generateBuildTime = (): string => {
    return `${Random.range(0.1, 10).toFixed(2)}s`;
  };

  // Generate random version numbers
  const generateVersion = (): string => {
    const major = Random.rangeFloor(0, 10);
    const minor = Random.rangeFloor(0, 10);
    const patch = Random.rangeFloor(0, 100);
    return `${major}.${minor}.${patch}`;
  };

  // Generate a random error message
  const generateError = (): string => {
    const errors = [
      `Cannot resolve module '${Random.pick(packages)}'`,
      'Unexpected token <',
      'Module not found',
      'Syntax error: Unexpected token',
      'TypeError: undefined is not a function',
      'Failed to compile',
      `Uncaught ReferenceError: ${Random.pick(packages)} is not defined`,
      'Invalid CSS after "...": expected 1 selector or at-rule, was "{"',
      'Uncaught SyntaxError: Unexpected end of JSON input',
      'Critical dependency: the request of a dependency is an expression',
    ];

    return Random.pick(errors);
  };

  // Generate a random warning message
  const generateWarning = (): string => {
    const warnings = [
      'Asset size limit: The following asset(s) exceed the recommended size limit',
      'Browserslist: caniuse-lite is outdated',
      'Critical dependency: require function is used in a way in which dependencies cannot be statically extracted',
      `Chunk ${generateChunkName()} [${generateFileSize(
        100,
        5000
      )}] exceeds the recommended limit of 244 KB`,
      'Multiple chunks emit assets to the same filename',
      'Circular dependency detected',
      'The following packages imported but unused',
      'Missing peer dependency',
      'Source map could not be loaded',
      'Conflicting order',
    ];

    return Random.pick(warnings);
  };

  // Log line generators for each build tool
  const logGenerators: Record<string, () => string[]> = {
    webpack: () => {
      const logs: string[] = [];

      // Start log
      logs.push(`webpack ${generateVersion()}`);
      logs.push(`Compiling...`);

      // Entry files
      for (let i = 0; i < Math.min(5, entryCount); i++) {
        logs.push(`[entry] ${generateFilePath()}`);
      }

      // Module logs
      for (let i = 0; i < entryCount; i++) {
        const filePath = generateFilePath();
        const fileSize = generateFileSize();
        logs.push(
          `[built] ${filePath} [${fileSize}] [${Random.rangeFloor(1, 101)}ms]`
        );
      }

      // Chunks
      const chunkCount = Math.floor(entryCount / 4) + 1;
      logs.push(`${chunkCount} chunks generated:`);
      for (let i = 0; i < chunkCount; i++) {
        const chunkName = generateChunkName();
        const fileSize = generateFileSize(50, 1500);
        logs.push(`  ${chunkName}.js [${fileSize}]`);
      }

      // Errors
      if (showErrors && Random.value() > 0.7) {
        const errorCount = Random.rangeFloor(1, 4); // 1-3 errors
        logs.push(`ERROR in ${generateFilePath()}`);
        for (let i = 0; i < errorCount; i++) {
          logs.push(`${generateError()}`);
        }
      }

      // Warnings
      if (showWarnings && Random.chance()) {
        const warningCount = Random.rangeFloor(1, 5); // 1-4 warnings
        logs.push(`${warningCount} warnings`);
        for (let i = 0; i < warningCount; i++) {
          logs.push(`warning ${generateWarning()}`);
        }
      }

      // Summary
      const buildTime = generateBuildTime();
      logs.push(`✓ Compiled successfully in ${buildTime}`);
      logs.push(`Hash: ${Random.value().toString(36).substring(2, 10)}`);
      logs.push(`Timestamp: ${new Date().toISOString()}`);

      return logs;
    },

    rollup: () => {
      const logs: string[] = [];

      // Start log
      logs.push(`rollup v${generateVersion()}`);
      logs.push(`bundles ${generateFilePath()} → dist/...`);

      // Processing logs
      logs.push(`Processing inputs...`);
      for (let i = 0; i < Math.min(entryCount, 10); i++) {
        const file = generateFilePath();
        logs.push(`[${i + 1}/${Math.min(entryCount, 10)}] ${file}`);
      }

      // Dependency resolution
      logs.push(`Resolving dependencies...`);
      for (let i = 0; i < Math.min(5, Math.floor(entryCount / 3)); i++) {
        const pkg = Random.pick(packages);
        logs.push(`(resolving) ${pkg}@^${generateVersion()}`);
      }

      // Chunk generation
      const outputFormat = Random.pick(['esm', 'cjs', 'umd', 'iife']);
      logs.push(`Generating ${outputFormat} bundle...`);

      // Generated files
      const fileCount = Math.floor(entryCount / 5) + 1;
      logs.push(`created ${fileCount} chunks:`);

      for (let i = 0; i < fileCount; i++) {
        const fileName =
          i === 0
            ? 'main.js'
            : `chunk-${Random.value().toString(36).substring(2, 10)}.js`;
        const fileSize = generateFileSize(10, 1000);
        logs.push(`dist/${fileName} [${fileSize}]`);
      }

      // Errors
      if (showErrors && Random.value() > 0.7) {
        logs.push(`Error: ${generateError()}`);
        logs.push(
          `    at ${generateFilePath()}:${Random.rangeFloor(
            1,
            1001
          )}:${Random.rangeFloor(1, 101)}`
        );
      }

      // Warnings
      if (showWarnings && Random.chance()) {
        const warningCount = Random.rangeFloor(1, 4);
        for (let i = 0; i < warningCount; i++) {
          logs.push(`(!) ${generateWarning()}`);
          logs.push(`${generateFilePath()}`);
        }
      }

      // Build time
      const buildTime = generateBuildTime();
      logs.push(`created ${fileCount} chunks in ${buildTime}`);

      return logs;
    },

    vite: () => {
      const logs: string[] = [];

      // Start log
      logs.push(
        `VITE v${generateVersion()} ready in ${Random.rangeFloor(50, 1001)}ms`
      );

      // Development server info
      if (Random.chance()) {
        // Dev server mode
        const port = 3000 + Random.rangeFloor(0, 2001);
        logs.push(`  ➜  Local:   http://localhost:${port}/`);
        logs.push(
          `  ➜  Network: http://192.168.1.${Random.rangeFloor(1, 256)}:${port}/`
        );

        // Hot module replacement
        logs.push(`[vite] hot module replacement enabled`);

        // File changes
        for (let i = 0; i < entryCount - logs.length; i++) {
          const filePath = generateFilePath();
          if (i < 3) {
            logs.push(`[vite] ${filePath} changed, reloading`);
          } else {
            logs.push(`[vite] ${generateFileSize(1, 100)} ${filePath}`);
          }
        }
      } else {
        // Build mode
        logs.push(`Building for production...`);

        const count = entryCount - logs.length;

        // Transform/bundle modules
        for (let i = 0; i < count; i++) {
          logs.push(`transforming (${i + 1}/${count})...`);
        }

        // Output files
        logs.push(`✓ ${count + 1} modules transformed.`);
        logs.push(`rendering chunks...`);
        logs.push(`computing hashes...`);
        logs.push(`optimizing dependencies...`);

        // Generated files
        logs.push(
          `Build completed. The dist directory is ready to be deployed.`
        );

        logs.push(
          `dist/assets/${Random.value()
            .toString(36)
            .substring(2, 10)}.js          ${generateFileSize(20, 200)}`
        );
        logs.push(
          `dist/assets/${Random.value()
            .toString(36)
            .substring(2, 10)}.css         ${generateFileSize(5, 50)}`
        );
        logs.push(
          `dist/assets/vendor-${Random.value()
            .toString(36)
            .substring(2, 10)}.js    ${generateFileSize(500, 1500)}`
        );

        // Build time
        const buildTime = generateBuildTime();
        logs.push(`✓ built in ${buildTime}`);
      }

      // Errors
      if (showErrors && Random.value() > 0.7) {
        logs.push(`[vite] Internal server error: ${generateError()}`);
        logs.push(
          `  at ${generateFilePath()}:${Random.rangeFloor(
            1,
            501
          )}:${Random.rangeFloor(1, 101)}`
        );
      }

      // Warnings
      if (showWarnings && Random.chance()) {
        logs.push(`[vite] ${generateWarning()}`);
      }

      return logs;
    },

    npm: () => {
      const logs: string[] = [];

      // Choose a common npm script
      const npmScript = Random.pick(['build', 'start', 'test', 'lint', 'dev']);

      // Start log
      logs.push(`> project@${generateVersion()} ${npmScript}`);
      logs.push(
        `> ${
          npmScript === 'build'
            ? 'webpack --mode production'
            : npmScript === 'start'
            ? 'node server.js'
            : npmScript === 'test'
            ? 'jest'
            : npmScript === 'lint'
            ? 'eslint src/**/*.js'
            : 'vite'
        }`
      );

      // Add specific output based on the npm script
      if (npmScript === 'test') {
        // Jest-like output
        const testFileCount = Math.floor(entryCount / 3);
        logs.push(`PASS src/__tests__/${generateFilePath()}`);

        for (let i = 0; i < Math.min(testFileCount, 5); i++) {
          const testName = Random.pick([
            'should render correctly',
            'handles click events',
            'updates state on change',
            'fetches data on mount',
            'matches snapshot',
            'renders with props',
            'handles error states',
          ]);

          logs.push(`  ✓ ${testName} (${Random.rangeFloor(1, 101)}ms)`);
        }

        if (showErrors && Random.value() > 0.7) {
          logs.push(`FAIL src/__tests__/${generateFilePath()}`);
          logs.push(`  ✕ should handle edge case correctly`);
          logs.push(`    Expected: ${Random.rangeFloor(0, 100)}`);
          logs.push(`    Received: ${Random.rangeFloor(0, 100)}`);
        }

        const passedTests =
          testFileCount - (showErrors && Random.value() > 0.7 ? 1 : 0);
        logs.push(
          `Test Suites: ${
            showErrors && Random.value() > 0.7 ? `1 failed, ` : ''
          }${passedTests} passed, ${testFileCount} total`
        );
        logs.push(
          `Tests:       ${
            showErrors && Random.value() > 0.7 ? `1 failed, ` : ''
          }${passedTests * 3} passed, ${testFileCount * 3} total`
        );
        logs.push(
          `Snapshots:   ${Math.floor(testFileCount / 2)} passed, ${Math.floor(
            testFileCount / 2
          )} total`
        );
        logs.push(`Time:        ${generateBuildTime()}`);
      } else if (npmScript === 'lint') {
        // ESLint-like output
        const fileCount = Math.floor(entryCount / 2);

        for (let i = 0; i < fileCount; i++) {
          const filePath = generateFilePath();

          if (i < fileCount - 2) {
            logs.push(`${filePath}: no issues`);
          } else if (showWarnings && Random.chance()) {
            logs.push(`${filePath}`);
            logs.push(`  warning  ${generateWarning()}  no-unused-vars`);
            logs.push(`  warning  Unexpected console statement  no-console`);
          } else if (showErrors && Random.value() > 0.7) {
            logs.push(`${filePath}`);
            logs.push(`  error  ${generateError()}  no-undef`);
          }
        }

        const errorCount =
          showErrors && Random.value() > 0.7 ? Random.rangeFloor(1, 4) : 0;
        const warningCount =
          showWarnings && Random.chance() ? Random.rangeFloor(1, 6) : 0;

        logs.push(`${fileCount} files checked`);
        if (errorCount > 0) logs.push(`✖ ${errorCount} errors`);
        if (warningCount > 0) logs.push(`⚠ ${warningCount} warnings`);
        if (errorCount === 0 && warningCount === 0)
          logs.push(`✔ No issues found`);
      } else {
        // Default to build tool-like output (simplified webpack/vite-like)
        logs.push('');
        for (let i = 0; i < Math.min(entryCount, 10); i++) {
          const filePath = generateFilePath();
          const fileSize = generateFileSize();

          logs.push(
            `${Math.floor(
              (i / entryCount) * 100
            )}% building ${filePath} ${fileSize}`
          );
        }

        // Output files
        logs.push(`✓ Built ${entryCount} modules in ${generateBuildTime()}`);

        // Add some file output
        const outputFiles = Math.floor(entryCount / 5) + 1;
        for (let i = 0; i < outputFiles; i++) {
          const fileName =
            i === 0
              ? 'main'
              : `chunk-${Random.value().toString(36).substring(2, 10)}`;
          const fileSize = generateFileSize(20, 1500);
          logs.push(`${fileName}.js ${fileSize}`);
        }
      }

      // Complete
      logs.push(`Done in ${Random.range(1, 31).toFixed(2)}s.`);

      return logs;
    },
  };

  // Generate logs based on the specified build tool
  if (buildTool in logGenerators) {
    return logGenerators[buildTool]();
  } else {
    // Default to webpack if an unsupported tool is specified
    return logGenerators.webpack();
  }
}
