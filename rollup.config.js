import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

const config = [
  // ES Module build (also emits .d.ts declarations)
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.esm.js',
      format: 'esm',
      sourcemap: true,
    },
    plugins: [
      resolve({ browser: true, preferBuiltins: false }),
      commonjs(),
      typescript({
        declaration: true,
        declarationDir: 'dist',
        rootDir: 'src',
        exclude: ['**/*.test.ts', '**/__tests__/**'],
      }),
    ],
    external: ['cross-fetch'],
  },
  // CommonJS build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.cjs',
      format: 'cjs',
      exports: 'named',
      sourcemap: true,
    },
    plugins: [
      resolve({ browser: true, preferBuiltins: false }),
      commonjs(),
      typescript({
        declaration: false,
        declarationMap: false,
        rootDir: 'src',
        exclude: ['**/*.test.ts', '**/__tests__/**'],
      }),
    ],
    external: ['cross-fetch'],
  },
  // Browser UMD build (dependencies bundled + minified)
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.browser.js',
      format: 'umd',
      name: 'InkressStorefront',
      exports: 'named',
      sourcemap: true,
    },
    plugins: [
      resolve({ browser: true, preferBuiltins: false }),
      commonjs(),
      typescript({
        declaration: false,
        declarationMap: false,
        rootDir: 'src',
        exclude: ['**/*.test.ts', '**/__tests__/**'],
      }),
      terser(),
    ],
  },
  // Auto-mount storefront kit (self-executing IIFE, deps bundled + minified).
  // A theme includes this one script; it reads config off <html> and mounts.
  {
    input: 'src/kit.ts',
    output: {
      file: 'dist/inkress-storefront.kit.js',
      format: 'iife',
      sourcemap: true,
    },
    plugins: [
      resolve({ browser: true, preferBuiltins: false }),
      commonjs(),
      typescript({
        declaration: false,
        declarationMap: false,
        rootDir: 'src',
        exclude: ['**/*.test.ts', '**/__tests__/**'],
      }),
      terser(),
    ],
  },
];

export default config;
