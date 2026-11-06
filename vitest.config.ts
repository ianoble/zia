import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';

// Engine source: an in-project copy (cloned by the Vercel build) or the sibling checkout used locally.
const engineRoot = fs.existsSync(path.resolve(__dirname, 'noble-bg-engine'))
	? path.resolve(__dirname, 'noble-bg-engine')
	: path.resolve(__dirname, '../noble-bg-engine');

export default defineConfig({
	plugins: [vue(), tailwindcss()],
	resolve: {
		dedupe: ['vue', 'pinia'],
		alias: {
			'@engine': path.join(engineRoot, 'packages/engine/src'),
		},
	},
	test: {
		environment: 'node',
	},
});
