import { defineConfig } from 'rollup';
import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig([
  // ES Module build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.esm.js',
      format: 'es',
      sourcemap: true,
    },
    plugins: [
      resolve({ 
        browser: false,
        preferBuiltins: true 
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        outputToFilesystem: true,
      }),
    ],
    external: ['cross-fetch'],
  },
  // CommonJS build  
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.js',
      format: 'cjs',
      exports: 'named',
      sourcemap: true,
    },
    plugins: [
      resolve({ 
        browser: false,
        preferBuiltins: true 
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        outputToFilesystem: false,
      }),
    ],
    external: ['cross-fetch'],
  },
  // Browser build (UMD with dependencies bundled)
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.browser.js',
      format: 'umd',
      name: 'InkressStorefront',
      sourcemap: true,
    },
    plugins: [
      resolve({ 
        browser: true,
        preferBuiltins: false 
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        outputToFilesystem: false,
      }),
    ],
  },
]);
