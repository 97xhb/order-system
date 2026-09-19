import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import 'element-plus/dist/index.css';
import 'element-plus/theme-chalk/dark/css-vars.css';
import { createApp } from 'vue';
import VxeUIBase from 'vxe-pc-ui';
import 'vxe-pc-ui/lib/style.css';
import VxeUITable from 'vxe-table';
import 'vxe-table/lib/style.css';
import App from './App.vue';
import router from './router';
import { pinia } from './stores/pinia';
import { useSystemStore } from './stores/system';
import './style.css';

const app = createApp(App);
app.use(pinia);
await useSystemStore(pinia).loadPublicSettings();
app.use(router).use(ElementPlus, { locale: zhCn }).use(VxeUIBase).use(VxeUITable).mount('#app');
