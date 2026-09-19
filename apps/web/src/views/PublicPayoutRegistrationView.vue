<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { getApiErrorMessage } from '../lib/api-error';
import { http } from '../lib/http';
import { useSystemStore } from '../stores/system';

type PayoutType = 'WECHAT' | 'ALIPAY' | 'BANK_CARD';

interface RegistrationData {
  enabled: boolean;
  linked: boolean;
  identityCode: string;
  nickname: string;
  locked: boolean;
}

interface SubmissionResult {
  identityCode: string;
  nickname: string;
  submittedCount: number;
  status: 'PENDING';
}

const route = useRoute();
const system = useSystemStore();
const token = computed(() => String(route.params.token));
const loading = ref(true);
const submitting = ref(false);
const loadError = ref('');
const data = ref<RegistrationData | null>(null);
const submitted = ref<SubmissionResult | null>(null);
const selectedTypes = ref<PayoutType[]>(['WECHAT']);

const form = reactive({
  nickname: '',
  alipayAccount: '',
  bankAccountName: '',
  bankName: '',
  bankCardNumber: '',
});

const methodOptions: Array<{
  value: PayoutType;
  label: string;
  short: string;
  description: string;
}> = [
  {
    value: 'WECHAT',
    label: '微信转账',
    short: '微',
    description: '直接按微信昵称转账',
  },
  {
    value: 'ALIPAY',
    label: '支付宝',
    short: '支',
    description: '填写支付宝账号',
  },
  {
    value: 'BANK_CARD',
    label: '银行卡',
    short: '卡',
    description: '填写姓名、银行和卡号',
  },
];

const toggleType = (type: PayoutType) => {
  selectedTypes.value = selectedTypes.value.includes(type)
    ? selectedTypes.value.filter((item) => item !== type)
    : [...selectedTypes.value, type];
};

const load = async () => {
  loading.value = true;
  loadError.value = '';
  try {
    const response = await http.get<RegistrationData>(`/public/payout-registration/${token.value}`);
    data.value = response.data;
    form.nickname = response.data.nickname || '';
  } catch (error) {
    data.value = null;
    loadError.value = getApiErrorMessage(error, '回款资料填写链接加载失败');
  } finally {
    loading.value = false;
  }
};

const validate = () => {
  if (!form.nickname.trim()) {
    ElMessage.warning('请填写微信昵称');
    return false;
  }
  if (!selectedTypes.value.length) {
    ElMessage.warning('请至少选择一种回款方式');
    return false;
  }
  if (selectedTypes.value.includes('ALIPAY') && !form.alipayAccount.trim()) {
    ElMessage.warning('请填写支付宝账号');
    return false;
  }
  if (selectedTypes.value.includes('BANK_CARD')) {
    if (!form.bankAccountName.trim()) {
      ElMessage.warning('请填写银行卡真实姓名');
      return false;
    }
    if (!form.bankName.trim()) {
      ElMessage.warning('请填写开户银行');
      return false;
    }
    if (!form.bankCardNumber.trim()) {
      ElMessage.warning('请填写银行卡号');
      return false;
    }
  }
  return true;
};

const payload = () => ({
  nickname: form.nickname.trim(),
  methods: selectedTypes.value.map((type) => ({
    type,
    accountName: type === 'BANK_CARD' ? form.bankAccountName.trim() : undefined,
    accountValue:
      type === 'ALIPAY'
        ? form.alipayAccount.trim()
        : type === 'BANK_CARD'
          ? form.bankCardNumber.trim()
          : undefined,
    bankName: type === 'BANK_CARD' ? form.bankName.trim() : undefined,
  })),
});

const submit = async () => {
  if (!validate()) return;
  submitting.value = true;
  try {
    const response = await http.post<SubmissionResult>(
      `/public/payout-registration/${token.value}`,
      payload(),
    );
    submitted.value = response.data;
    form.alipayAccount = '';
    form.bankAccountName = '';
    form.bankName = '';
    form.bankCardNumber = '';
    ElMessage.success('回款资料已提交');
  } catch (error) {
    const message = getApiErrorMessage(error, '提交失败，请稍后重试');
    if (message.includes('已由管理员确认')) {
      data.value = data.value ? { ...data.value, locked: true } : data.value;
      submitted.value = null;
    }
    ElMessage.error(message);
  } finally {
    submitting.value = false;
  }
};

const fillAgain = () => {
  submitted.value = null;
  selectedTypes.value = ['WECHAT'];
};

onMounted(() => void load());
</script>

<template>
  <div class="public-payout-page">
    <header class="public-payout-header">
      <div class="brand-mark" :class="{ 'is-long': (system.brandMarkText || '浪姐').length > 2 }">
        {{ system.brandMarkText || '浪姐' }}
      </div>
      <div>
        <strong>回款资料登记</strong>
        <span>填写一次，后续回款不用反复询问</span>
      </div>
    </header>

    <main v-loading="loading" class="registration-card">
      <el-result v-if="loadError" icon="error" title="链接暂时不可用" :sub-title="loadError">
        <template #extra>
          <el-button type="primary" round @click="load">重新加载</el-button>
        </template>
      </el-result>

      <el-result
        v-else-if="data && !data.enabled"
        icon="warning"
        title="填写已暂停"
        sub-title="管理员当前关闭了回款资料填写，请稍后再试。"
      />

      <el-result
        v-else-if="data && data.locked"
        icon="success"
        title="回款资料已确认"
        sub-title="管理员已经确认你的回款资料，如需变更请联系管理员。"
      />

      <el-result
        v-else-if="submitted"
        icon="success"
        title="回款资料已提交"
        sub-title="资料已加密保存；管理员确认前可以补充或修正，确认后如需变更请联系管理员。"
      >
        <template #extra>
          <div class="success-summary">
            <span>微信昵称</span><strong>{{ submitted.nickname }}</strong> <span>提交方式</span
            ><strong>{{ submitted.submittedCount }} 种</strong> <span>下单人识别码</span
            ><strong>{{ submitted.identityCode }}</strong>
          </div>
          <div class="success-actions">
            <el-button round @click="fillAgain">重新填写或修改</el-button>
          </div>
        </template>
      </el-result>

      <template v-else-if="data">
        <section class="intro-block">
          <div>
            <span>{{ data.linked ? '下单人识别码' : '本次登记识别码' }}</span>
            <strong>{{ data.identityCode }}</strong>
          </div>
          <div class="intro-actions">
            <p>支付宝账号和银行卡号会加密保存，后台列表默认只显示脱敏内容。</p>
          </div>
        </section>

        <el-form
          :model="form"
          label-position="top"
          class="registration-form"
          @submit.prevent="submit"
        >
          <section class="form-section">
            <div class="section-heading">
              <span>01</span>
              <div>
                <strong>填写微信昵称</strong>
                <small>请填写平时和管理员联系时使用的昵称</small>
              </div>
            </div>
            <el-form-item label="微信昵称" required>
              <el-input
                v-model="form.nickname"
                maxlength="100"
                clearable
                size="large"
                placeholder="请输入微信昵称"
              />
            </el-form-item>
          </section>

          <section class="form-section">
            <div class="section-heading">
              <span>02</span>
              <div>
                <strong>选择回款方式</strong>
                <small>支持多选，只填写已选择方式的资料</small>
              </div>
            </div>

            <div class="method-options">
              <button
                v-for="option in methodOptions"
                :key="option.value"
                type="button"
                class="card-choice method-option"
                :class="{ 'is-selected': selectedTypes.includes(option.value) }"
                :aria-pressed="selectedTypes.includes(option.value)"
                @click="toggleType(option.value)"
              >
                <span>{{ option.short }}</span>
                <div>
                  <b>{{ option.label }}</b>
                  <small>{{ option.description }}</small>
                </div>
              </button>
            </div>

            <div v-if="selectedTypes.includes('WECHAT')" class="wechat-tip">
              微信转账直接使用上方填写的微信昵称，不需要填写微信号。
            </div>

            <section v-if="selectedTypes.includes('ALIPAY')" class="method-fields alipay-fields">
              <div class="method-fields-title"><span>支</span><strong>支付宝资料</strong></div>
              <el-form-item label="支付宝账号" required>
                <el-input
                  v-model="form.alipayAccount"
                  maxlength="500"
                  size="large"
                  placeholder="手机号、邮箱或支付宝账号"
                />
              </el-form-item>
            </section>

            <section v-if="selectedTypes.includes('BANK_CARD')" class="method-fields bank-fields">
              <div class="method-fields-title"><span>卡</span><strong>银行卡资料</strong></div>
              <div class="bank-grid">
                <el-form-item label="真实姓名" required>
                  <el-input
                    v-model="form.bankAccountName"
                    maxlength="150"
                    size="large"
                    placeholder="银行卡开户姓名"
                  />
                </el-form-item>
                <el-form-item label="开户银行" required>
                  <el-input
                    v-model="form.bankName"
                    maxlength="150"
                    size="large"
                    placeholder="例如：中国工商银行"
                  />
                </el-form-item>
                <el-form-item label="银行卡号" required class="span-two">
                  <el-input
                    v-model="form.bankCardNumber"
                    maxlength="500"
                    inputmode="numeric"
                    size="large"
                    placeholder="请输入银行卡号"
                  />
                </el-form-item>
              </div>
            </section>
          </section>

          <div class="submit-area">
            <p>提交后状态为“待确认”，管理员确认后才作为正式回款资料使用。</p>
            <el-button native-type="submit" type="primary" size="large" round :loading="submitting">
              提交回款资料
            </el-button>
          </div>
        </el-form>
      </template>
    </main>

    <footer>下单登记与资金结算系统</footer>
  </div>
</template>

<style scoped>
.public-payout-page {
  /* 回款登记分享页在全局 +1px 基础上再放大 2px。 */
  --el-font-size-extra-large: 23px;
  --el-font-size-large: 21px;
  --el-font-size-medium: 19px;
  --el-font-size-base: 17px;
  --el-font-size-small: 16px;
  --el-font-size-extra-small: 15px;
  --el-result-title-font-size: 23px;
  min-height: 100vh;
  padding: 18px 14px 28px;
  color: #334155;
  background:
    radial-gradient(circle at 12% 0, rgba(96, 165, 250, 0.2), transparent 32%),
    linear-gradient(180deg, #eef6ff 0, #f6f8fb 280px);
}

.public-payout-header,
.registration-card,
footer {
  width: min(660px, 100%);
  margin-right: auto;
  margin-left: auto;
}

.public-payout-header {
  display: flex;
  align-items: center;
  padding: 3px 2px 16px;
  gap: 11px;
}

.brand-mark {
  display: grid;
  width: 50px;
  height: 50px;
  place-items: center;
  border-radius: 14px;
  color: #fff;
  background: linear-gradient(145deg, #60a5fa, #2563eb);
  box-shadow: 0 9px 22px rgba(37, 99, 235, 0.22);
  font-size: 16px;
  font-weight: 800;
}

.brand-mark.is-long {
  font-size: 11px;
  letter-spacing: 0;
}

.public-payout-header > div:last-child {
  display: flex;
  flex-direction: column;
}

.public-payout-header strong {
  color: #0f172a;
  font-size: 20px;
}

.public-payout-header span {
  margin-top: 2px;
  color: #64748b;
  font-size: 14px;
}

.registration-card {
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 22px 55px rgba(15, 23, 42, 0.1);
  backdrop-filter: blur(16px);
}

.intro-block {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 18px;
  border-bottom: 1px solid #e8edf4;
  background: rgba(239, 246, 255, 0.7);
  gap: 20px;
}

.intro-block > div {
  display: flex;
  flex-direction: column;
}

.intro-block .intro-actions {
  align-items: flex-end;
}

.intro-block span,
.intro-block p {
  color: #64748b;
  font-size: 13px;
}

.intro-block strong {
  margin-top: 2px;
  color: #2563eb;
  font-size: 19px;
  letter-spacing: 0.04em;
}

.intro-block p {
  max-width: 350px;
  margin: 0;
  line-height: 1.6;
  text-align: right;
}

.intro-actions :deep(.el-button) {
  margin-top: 7px;
  border-color: rgba(59, 130, 246, 0.25);
  color: #2563eb;
  background: rgba(255, 255, 255, 0.72);
}

.registration-form {
  padding: 18px;
}

.form-section + .form-section {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #e8edf4;
}

.section-heading,
.method-fields-title {
  display: flex;
  align-items: center;
}

.section-heading {
  margin-bottom: 15px;
  gap: 10px;
}

.section-heading > span,
.method-fields-title > span {
  display: grid;
  place-items: center;
  border-radius: 10px;
  color: #2563eb;
  background: #eaf2ff;
  font-size: 13px;
  font-weight: 800;
}

.section-heading > span {
  width: 34px;
  height: 34px;
}

.section-heading > div {
  display: flex;
  flex-direction: column;
}

.section-heading strong {
  color: #0f172a;
  font-size: 17px;
}

.section-heading small {
  margin-top: 2px;
  color: #94a3b8;
  font-size: 13px;
}

.method-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;
}

.method-option {
  position: relative;
  display: flex;
  min-width: 0;
  align-items: center;
  padding: 10px;
  border: 1px solid #dde5ef;
  border-radius: 14px;
  color: #334155;
  background: #fff;
  cursor: pointer;
  text-align: left;
  transition: 0.18s ease;
  gap: 9px;
}

.method-option:hover {
  border-color: #9fc3fa;
  transform: translateY(-1px);
}

.method-option:focus-visible {
  outline: 2px solid rgba(59, 130, 246, 0.48);
  outline-offset: 2px;
}

.method-option.is-selected {
  border-color: #7db0f7;
  background: #f0f6ff;
  box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.08);
}

.method-option > span {
  display: grid;
  flex: 0 0 31px;
  height: 31px;
  place-items: center;
  border-radius: 10px;
  color: #2563eb;
  background: #eaf2ff;
  font-size: 15px;
  font-weight: 700;
}

.method-option > div {
  min-width: 0;
}

.method-option b,
.method-option small {
  display: block;
}

.method-option b {
  color: #0f172a;
  font-size: 15px;
}

.method-option small {
  margin-top: 2px;
  overflow: hidden;
  color: #94a3b8;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wechat-tip {
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(34, 197, 94, 0.2);
  border-radius: 12px;
  color: #15803d;
  background: rgba(34, 197, 94, 0.08);
  font-size: 14px;
  line-height: 1.6;
}

.method-fields {
  margin-top: 12px;
  padding: 14px 14px 1px;
  border: 1px solid #e2e8f0;
  border-radius: 15px;
  background: #f8fafc;
}

.method-fields-title {
  margin-bottom: 12px;
  gap: 8px;
}

.method-fields-title > span {
  width: 28px;
  height: 28px;
}

.method-fields-title strong {
  color: #0f172a;
  font-size: 15px;
}

.bank-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 12px;
}

.span-two {
  grid-column: 1 / -1;
}

.registration-form :deep(.el-form-item__label) {
  color: #475569;
  font-size: 15px;
  font-weight: 600;
}

.submit-area {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #e8edf4;
  gap: 16px;
}

.submit-area p {
  max-width: 390px;
  margin: 0;
  color: #94a3b8;
  font-size: 13px;
  line-height: 1.6;
}

.submit-area :deep(.el-button) {
  min-width: 160px;
}

.success-summary {
  display: grid;
  grid-template-columns: auto auto;
  width: min(320px, 100%);
  margin: 0 auto 16px;
  padding: 12px 14px;
  border-radius: 14px;
  background: #f8fafc;
  gap: 8px 20px;
  text-align: left;
}

.success-summary span {
  color: #94a3b8;
  font-size: 14px;
}

.success-summary strong {
  color: #334155;
  font-size: 15px;
  text-align: right;
}

.success-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
}

footer {
  padding-top: 18px;
  color: #94a3b8;
  font-size: 13px;
  text-align: center;
}

@media (max-width: 560px) {
  .public-payout-page {
    padding: 13px 10px 24px;
  }

  .registration-card {
    border-radius: 18px;
  }

  .intro-block {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }

  .intro-block p {
    max-width: none;
    text-align: left;
  }

  .intro-block .intro-actions {
    width: 100%;
    align-items: flex-start;
  }

  .intro-actions :deep(.el-button) {
    width: 100%;
  }

  .registration-form {
    padding: 15px;
  }

  .method-options,
  .bank-grid {
    grid-template-columns: 1fr;
  }

  .span-two {
    grid-column: 1;
  }

  .method-option small {
    white-space: normal;
  }

  .submit-area {
    align-items: stretch;
    flex-direction: column;
  }

  .submit-area :deep(.el-button) {
    width: 100%;
    min-width: 0;
  }

  .success-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
