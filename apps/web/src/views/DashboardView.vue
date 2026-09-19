<script setup lang="ts">
import { ArrowRight, Document, Refresh, Warning } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getApiErrorMessage } from '../lib/api-error';
import { formatBusinessDate } from '../lib/business-date';
import { http } from '../lib/http';

interface DashboardData {
  metrics: {
    monthOrderAmount: string | number;
    customerOutstandingAmount: string | number;
    submitterOutstandingAmount: string | number;
    monthSettledProfit: string | number;
  };
  queues: {
    pendingReview: number;
    notShipped: number;
    unpaidReceipt: number;
    unpaidPayout: number;
    receivedNotPaid: number;
  };
  recent: Array<{
    id: string;
    serialNo: number;
    orderedAt: string;
    productNameSnapshot: string;
    reviewStatus: string;
    receivableStatus: string;
    submitterSettlementStatus: string;
    settledProfit: string | number;
    platform: { name: string };
    submitter: { name: string };
  }>;
}

const router = useRouter();
const loading = ref(false);
const data = ref<DashboardData | null>(null);
const money = (value: string | number | undefined) => `¥${Number(value ?? 0).toFixed(2)}`;
const receivableStatusText = (status: string) => {
  if (status === 'PAID') return '已回款';
  if (status === 'EXCEPTION') return '异常';
  return '未回款';
};
const submitterSettlementStatusText = (status: string) => {
  if (status === 'PAID') return '已结算';
  if (status === 'EXCEPTION') return '异常';
  return '未结算';
};

const metrics = computed(() => [
  {
    label: '本月下单金额',
    value: money(data.value?.metrics.monthOrderAmount),
    detail: '按下单日期统计已确认订单',
    tone: 'blue',
  },
  {
    label: '收货佬待给我回款',
    value: money(data.value?.metrics.customerOutstandingAmount),
    detail: '全部未回款订单的剩余金额',
    tone: 'orange',
  },
  {
    label: '待给下单人结算',
    value: money(data.value?.metrics.submitterOutstandingAmount),
    detail: '全部未结算订单的剩余金额',
    tone: 'purple',
  },
  {
    label: '本月已结算利润',
    value: money(data.value?.metrics.monthSettledProfit),
    detail: '未全额回款的订单显示为 0',
    tone: 'green',
  },
]);

const queues = computed(() => [
  {
    label: '待审核订单',
    count: data.value?.queues.pendingReview ?? 0,
    tone: 'blue',
    filter: 'pending',
  },
  {
    label: '未寄出',
    count: data.value?.queues.notShipped ?? 0,
    tone: 'slate',
    filter: 'not-shipped',
  },
  {
    label: '收货佬未给我回款',
    count: data.value?.queues.unpaidReceipt ?? 0,
    tone: 'amber',
    filter: 'unpaid-receipt',
  },
  {
    label: '未给下单人结算',
    count: data.value?.queues.unpaidPayout ?? 0,
    tone: 'orange',
    filter: 'unpaid-payout',
  },
  {
    label: '收货佬已回款但下单人未结算',
    count: data.value?.queues.receivedNotPaid ?? 0,
    tone: 'red',
    filter: 'received-not-paid',
  },
]);

const load = async () => {
  loading.value = true;
  try {
    data.value = (await http.get<DashboardData>('/admin/orders/dashboard/summary')).data;
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '业务总览加载失败'));
  } finally {
    loading.value = false;
  }
};

const openQueue = (filter: string) => {
  void router.push({ path: '/admin/orders', query: { view: filter } });
};

onMounted(load);
</script>

<template>
  <div class="page-shell dashboard-page" v-loading="loading">
    <div class="page-heading">
      <div>
        <span class="page-kicker">BUSINESS OVERVIEW</span>
        <h1>业务总览</h1>
        <p>收货佬给我的回款、给下单人的结算分开统计，优先处理未完成事项。</p>
      </div>
      <div class="heading-actions">
        <el-button round :icon="Refresh" :loading="loading" @click="load">刷新</el-button
        ><el-button round type="primary" @click="router.push('/admin/orders')"
          >查看订单总列表</el-button
        >
      </div>
    </div>

    <section class="metric-grid">
      <article
        v-for="metric in metrics"
        :key="metric.label"
        :class="['metric-card', 'surface-card', `metric-card--${metric.tone}`]"
      >
        <div class="metric-head">
          <span>{{ metric.label }}</span
          ><i :class="['metric-icon', metric.tone]"></i>
        </div>
        <strong class="money">{{ metric.value }}</strong
        ><small>{{ metric.detail }}</small>
      </article>
    </section>

    <section class="surface-card queue-card">
      <div class="section-title">
        <div class="section-title-copy">
          <span class="section-title-icon is-warning" aria-hidden="true">
            <el-icon><Warning /></el-icon>
          </span>
          <div>
            <h2>待处理事项</h2>
            <p>点击分类直接进入带好筛选条件的订单表。</p>
          </div>
        </div>
      </div>
      <div class="queue-grid">
        <button
          v-for="item in queues"
          :key="item.label"
          :class="['queue-item', `queue-item--${item.tone}`]"
          type="button"
          @click="openQueue(item.filter)"
        >
          <span class="queue-label"><i></i>{{ item.label }}</span>
          <span class="queue-summary"
            ><strong class="queue-count">{{ item.count }}</strong
            ><small>笔待处理</small
            ><span class="queue-arrow"
              ><el-icon><ArrowRight /></el-icon></span
          ></span>
        </button>
      </div>
    </section>

    <section class="surface-card recent-card">
      <div class="section-title">
        <div class="section-title-copy">
          <span class="section-title-icon" aria-hidden="true">
            <el-icon><Document /></el-icon>
          </span>
          <div>
            <h2>最近订单</h2>
            <p>按最近修改时间显示审核及回款状态。</p>
          </div>
        </div>
      </div>
      <el-empty v-if="!data?.recent.length" description="暂时没有订单数据" :image-size="76" />
      <div v-else class="recent-list">
        <button
          v-for="order in data.recent"
          :key="order.id"
          type="button"
          @click="router.push('/admin/orders')"
        >
          <span class="recent-main"
            ><b>#{{ order.serialNo }} · {{ order.productNameSnapshot }}</b
            ><small
              >{{ order.platform.name }} · {{ order.submitter.name }} ·
              {{ formatBusinessDate(order.orderedAt) }}</small
            ></span
          ><span class="recent-status"
            >收货佬：{{ receivableStatusText(order.receivableStatus) }}<br />下单人：{{
              submitterSettlementStatusText(order.submitterSettlementStatus)
            }}</span
          ><strong>{{ money(order.settledProfit) }}</strong
          ><el-icon><ArrowRight /></el-icon>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dashboard-page {
  display: grid;
  gap: 14px;
}

.heading-actions {
  display: flex;
  gap: 8px;
}

.heading-actions :deep(.el-button) {
  backdrop-filter: blur(12px);
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
.metric-card,
.queue-card,
.recent-card {
  padding: 17px;
}

.metric-card {
  --metric-accent: var(--app-primary);
  position: relative;
  overflow: hidden;
  border-color: color-mix(in srgb, var(--metric-accent) 17%, var(--app-border));
  background: color-mix(in srgb, var(--metric-accent) 6%, var(--app-card));
  box-shadow:
    var(--app-shadow-sm),
    inset 0 1px 0 color-mix(in srgb, var(--app-card-solid) 62%, transparent);
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.metric-card:hover {
  border-color: color-mix(in srgb, var(--metric-accent) 30%, var(--app-border));
  box-shadow: var(--app-shadow);
  transform: translateY(-1px);
}

.metric-card--blue {
  --metric-accent: #3b82f6;
}

.metric-card--orange {
  --metric-accent: #f59e0b;
}

.metric-card--purple {
  --metric-accent: #8b5cf6;
}

.metric-card--green {
  --metric-accent: #10b981;
}

.queue-card {
  border-color: color-mix(in srgb, var(--app-warning) 10%, var(--app-border));
  background: color-mix(in srgb, var(--app-primary-soft) 16%, var(--app-card));
}

.recent-card {
  border-color: color-mix(in srgb, var(--app-primary) 8%, var(--app-border));
  background: color-mix(in srgb, var(--app-card-solid) 18%, var(--app-card));
}
.metric-head,
.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.metric-head {
  color: var(--app-muted);
  font-size: 14px;
}
.metric-icon {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 11px;
  color: var(--metric-accent);
  background: color-mix(in srgb, var(--metric-accent) 11%, transparent);
}

.metric-icon::after {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 12%, transparent);
  content: '';
}
.metric-card strong {
  display: block;
  margin-top: 13px;
  color: var(--app-heading);
  font-size: 28px;
}
.metric-card small {
  display: block;
  margin-top: 8px;
  color: var(--app-muted);
}
.section-title {
  padding-bottom: 13px;
  gap: 12px;
}

.section-title-copy {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.section-title-copy > div {
  min-width: 0;
}

.section-title-icon {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  border-radius: 12px;
  color: var(--app-primary);
  background: var(--app-primary-soft);
}

.section-title-icon.is-warning {
  color: var(--app-warning);
  background: color-mix(in srgb, var(--app-warning) 12%, transparent);
}

.section-title-icon.is-success {
  color: var(--app-success);
  background: color-mix(in srgb, var(--app-success) 12%, transparent);
}

.section-title-icon svg {
  width: 16px;
  height: 16px;
}
.section-title h2 {
  margin: 0;
  color: var(--app-heading);
  font-size: 18px;
}
.section-title p {
  margin: 4px 0 0;
  color: var(--app-muted);
  font-size: 13px;
}
.queue-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}
.queue-item {
  --queue-accent: var(--app-primary);
  display: flex;
  min-width: 0;
  min-height: 104px;
  flex-direction: column;
  justify-content: space-between;
  padding: 14px 15px 13px;
  border: 1px solid color-mix(in srgb, var(--queue-accent) 20%, var(--app-border));
  border-radius: 16px;
  color: var(--app-text);
  background: color-mix(in srgb, var(--queue-accent) 6%, var(--app-card-solid));
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--app-card-solid) 62%, transparent),
    0 8px 18px color-mix(in srgb, var(--queue-accent) 6%, transparent);
  text-align: left;
  cursor: pointer;
  gap: 12px;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}
.queue-item--slate {
  --queue-accent: #64748b;
}
.queue-item--amber {
  --queue-accent: #f59e0b;
}
.queue-item--orange {
  --queue-accent: #f97316;
}
.queue-item--red {
  --queue-accent: #ef4444;
}
.queue-item:hover {
  border-color: color-mix(in srgb, var(--queue-accent) 48%, var(--app-border));
  box-shadow: 0 12px 25px color-mix(in srgb, var(--queue-accent) 13%, transparent);
  transform: translateY(-2px);
}
.queue-item:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--queue-accent) 22%, transparent);
  outline-offset: 2px;
}
.queue-label {
  display: flex;
  align-items: center;
  color: var(--app-text);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.45;
}
.queue-label i {
  width: 9px;
  height: 9px;
  flex: 0 0 auto;
  margin-right: 8px;
  border-radius: 50%;
  background: var(--queue-accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--queue-accent) 13%, transparent);
}
.queue-summary {
  display: flex;
  align-items: flex-end;
  min-width: 0;
  gap: 5px;
}
.queue-count {
  color: var(--app-heading);
  font-size: 26px;
  font-weight: 750;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.queue-summary small {
  margin-bottom: 1px;
  color: var(--app-muted);
  font-size: 12px;
}
.queue-arrow {
  display: grid;
  width: 28px;
  height: 28px;
  margin-left: auto;
  place-items: center;
  border-radius: 10px;
  color: var(--queue-accent);
  background: color-mix(in srgb, var(--queue-accent) 12%, transparent);
}
.recent-list {
  display: grid;
  gap: 7px;
}
.recent-list button {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px 100px auto;
  width: 100%;
  align-items: center;
  padding: 11px 12px;
  border: 1px solid var(--app-border);
  border-radius: 13px;
  color: var(--app-text);
  background: color-mix(in srgb, var(--app-control) 66%, transparent);
  font-size: 15px;
  text-align: left;
  cursor: pointer;
  gap: 12px;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    transform 0.18s ease;
}

.recent-list button:hover {
  border-color: color-mix(in srgb, var(--app-primary) 25%, var(--app-border));
  background: color-mix(in srgb, var(--app-primary-soft) 22%, var(--app-card-solid));
  transform: translateX(2px);
}
.recent-main {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}
.recent-main b {
  overflow: hidden;
  color: var(--app-heading);
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.recent-main small,
.recent-status {
  color: var(--app-muted);
  font-size: 10px;
  line-height: 1.6;
}
.recent-list strong {
  color: var(--app-success);
  font-size: 15px;
  text-align: right;
}
@media (max-width: 1360px) {
  .queue-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 1050px) {
  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .queue-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 620px) {
  .metric-grid,
  .queue-grid {
    grid-template-columns: 1fr;
  }
  .heading-actions {
    width: 100%;
  }
  .heading-actions .el-button {
    flex: 1;
  }
  .recent-list button {
    grid-template-columns: 1fr auto;
  }
  .recent-status {
    display: none;
  }
  .recent-list strong {
    grid-column: 1;
    text-align: left;
  }
}
</style>
