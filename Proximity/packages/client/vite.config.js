import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
    plugins: [
        react(),
        nodePolyfills({
            // Whether to polyfill `node:` protocol imports.
            protocolImports: true,
        }),
    ],
    server: {
        port: 5173,
    },
    resolve: {
        alias: {
            // simple-peer requires this
            'readable-stream': 'vite-compatible-readable-stream',
        },
    },
});
