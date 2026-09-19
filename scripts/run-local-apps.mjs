import { spawn } from 'node:child_process';
import process from 'node:process';

const pnpmCliPath = process.env.npm_execpath;
const pnpmCommand = pnpmCliPath
  ? process.execPath
  : process.platform === 'win32'
    ? 'corepack.cmd'
    : 'corepack';
const pnpmPrefixArgs = pnpmCliPath ? [pnpmCliPath] : ['pnpm'];

if (process.env.DATABASE_URL) {
  const databaseUrl = new URL(process.env.DATABASE_URL);
  databaseUrl.searchParams.set('schema', 'public');
  databaseUrl.searchParams.set('sslmode', 'disable');
  process.env.DATABASE_URL = databaseUrl.toString();
}

function run(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(pnpmCommand, [...pnpmPrefixArgs, ...args], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
      shell: !pnpmCliPath && process.platform === 'win32',
      ...options,
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`命令被信号 ${signal} 中止`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

async function main() {
  process.env.API_WATCH_RESTART_ENABLED = 'true';
  process.env.WEB_WATCH_RESTART_ENABLED = 'true';

  console.log('正在生成本机 Prisma 客户端…');
  let code = await run(['--filter', '@order-system/api', 'prisma:generate']);
  if (code !== 0) process.exit(code);

  console.log('正在同步本机数据库结构…');
  code = await run(['--filter', '@order-system/api', 'db:deploy:local']);
  if (code !== 0) process.exit(code);

  console.log('');
  console.log('本机调试地址：http://localhost:5173/login');
  console.log(`管理员账号：${process.env.ADMIN_USERNAME || 'admin'}`);
  console.log('管理员密码：使用项目 .env 中配置的密码，终端不会显示明文');
  console.log('停止运行：在当前窗口按 Ctrl+C');
  console.log('');

  code = await run([
    '--parallel',
    '--filter',
    '@order-system/api',
    '--filter',
    '@order-system/web',
    'dev',
  ]);
  process.exit(code);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
