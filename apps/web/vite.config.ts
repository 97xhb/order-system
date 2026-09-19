import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));
const webRestartTriggerPath = fileURLToPath(
  new URL('./src/runtime-restart.trigger.ts', import.meta.url),
);

const panelRuntimePlugin = (): Plugin => ({
  name: 'order-system-panel-runtime-control',
  configureServer(server) {
    const runtime = {
      service: 'order-system-web',
      instanceId: randomUUID(),
      startedAt: new Date().toISOString(),
    };

    server.middlewares.use('/__panel_runtime', (request, response, next) => {
      if (request.method !== 'GET') {
        next();
        return;
      }
      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.setHeader('Cache-Control', 'no-store, max-age=0');
      response.end(JSON.stringify(runtime));
    });

    const restartEnabled =
      process.env.WEB_WATCH_RESTART_ENABLED === 'true' ||
      process.env.API_WATCH_RESTART_ENABLED === 'true';
    if (!restartEnabled) return;

    let restartScheduled = false;
    const normalizedTriggerPath = path.normalize(webRestartTriggerPath).toLowerCase();
    server.watcher.add(webRestartTriggerPath);
    server.watcher.on('change', (changedPath) => {
      if (restartScheduled || path.normalize(changedPath).toLowerCase() !== normalizedTriggerPath) {
        return;
      }

      restartScheduled = true;
      const timer = setTimeout(() => {
        void server.restart().catch((error: unknown) => {
          restartScheduled = false;
          console.error('Web panel restart failed', error);
        });
      }, 250);
      timer.unref();
    });
  },
});

export default defineConfig(() => {
  return {
    envDir: workspaceRoot,
    plugins: [vue(), panelRuntimePlugin()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts: true as const,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          xfwd: true,
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts: true as const,
    },
  };
});
