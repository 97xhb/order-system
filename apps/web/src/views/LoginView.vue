<script setup lang="ts">
import { Lock, User } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getApiErrorMessage } from '../lib/api-error';
import { useAuthStore } from '../stores/auth';
import { useSystemStore } from '../stores/system';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const system = useSystemStore();

const form = reactive({
  username: 'admin',
  password: '',
});

const submit = async () => {
  try {
    await auth.login(form.username, form.password);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '';
    await router.replace(redirect.startsWith('/admin') ? redirect : '/admin/dashboard');
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '账号或密码不正确'));
  }
};
</script>

<template>
  <main class="login-page">
    <section class="login-panel">
      <div class="login-brand">
        <div class="brand-mark" :class="{ 'is-long': (system.brandMarkText || '浪姐').length > 2 }">
          {{ system.brandMarkText || '浪姐' }}
        </div>
        <div>
          <strong>{{ system.systemName }}</strong>
          <span>订单 · 货物 · 资金</span>
        </div>
      </div>

      <div class="login-copy">
        <span>管理员后台</span>
        <h1>登录后继续管理业务</h1>
        <p>收货佬回款、给下单人结算和利润数据仅管理员可见。</p>
      </div>

      <el-form :model="form" label-position="top" @submit.prevent="submit">
        <el-form-item label="管理员账号">
          <el-input
            v-model="form.username"
            :prefix-icon="User"
            size="large"
            autocomplete="username"
            autofocus
          />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="form.password"
            :prefix-icon="Lock"
            type="password"
            minlength="6"
            show-password
            size="large"
            autocomplete="current-password"
            @keyup.enter="submit"
          />
        </el-form-item>
        <el-button
          type="primary"
          size="large"
          native-type="submit"
          :loading="auth.loading"
          class="login-button"
        >
          登录
        </el-button>
      </el-form>

      <div class="login-note">本机管理员账号及密码由项目 `.env` 配置创建。</div>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  display: grid;
  min-height: 100vh;
  padding: 24px;
  place-items: center;
  background:
    radial-gradient(circle at 20% 10%, rgba(22, 119, 255, 0.18), transparent 38%),
    linear-gradient(145deg, #0f172a 0%, #172554 48%, #0f172a 100%);
}

.login-panel {
  width: min(430px, 100%);
  padding: 30px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 28px 70px rgba(2, 6, 23, 0.42);
}

.login-brand,
.login-brand > div:last-child {
  display: flex;
}

.login-brand {
  align-items: center;
  gap: 11px;
}

.brand-mark {
  display: grid;
  width: 50px;
  height: 50px;
  place-items: center;
  border-radius: 15px;
  color: #fff;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.04em;
  background: linear-gradient(145deg, #409eff, #155eef);
}

.brand-mark.is-long {
  font-size: 11px;
  letter-spacing: 0;
}

.login-brand > div:last-child {
  flex-direction: column;
}

.login-brand strong {
  color: #101828;
  font-size: 17px;
}

.login-brand span {
  margin-top: 2px;
  color: #98a2b3;
  font-size: 12px;
}

.login-copy {
  margin: 30px 0 24px;
}

.login-copy > span {
  color: #175cd3;
  font-size: 13px;
  font-weight: 700;
}

.login-copy h1 {
  margin: 7px 0 5px;
  color: #101828;
  font-size: 26px;
}

.login-copy p,
.login-note {
  color: #667085;
  font-size: 14px;
  line-height: 1.6;
}

.login-copy p {
  margin: 0;
}

.login-button {
  width: 100%;
  margin-top: 5px;
}

.login-note {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #eaecf0;
  text-align: center;
}

@media (max-width: 520px) {
  .login-page {
    padding: 14px;
  }

  .login-panel {
    padding: 24px 20px;
  }
}
</style>
