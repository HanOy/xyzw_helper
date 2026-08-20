import { createRouter, createWebHistory } from 'vue-router';
import { useTokensStore } from '@/stores/tokens';
import { getStoredToken } from '@/api';

const generatedRoutes = [];

const my_routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/Home.vue'),
    meta: { title: '首页' },
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { title: '登录' },
  },
  {
    path: '/tokens',
    name: 'TokenImport',
    component: () => import('@/views/TokenImport/index.vue'),
    meta: { title: 'Token管理' },
    props: (route) => ({
      token: route.query.token,
      name: route.query.name,
      server: route.query.server,
      wsUrl: route.query.wsUrl,
      api: route.query.api,
      auto: route.query.auto === 'true',
    }),
  },
  {
    name: 'DefaultLayout',
    path: '/admin',
    component: () => import('@/layout/DefaultLayout.vue'),
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
        meta: { title: '控制台', requiresToken: true },
      },
      {
        path: 'game-features',
        name: 'GameFeatures',
        component: () => import('@/views/GameFeatures.vue'),
        meta: { title: '游戏功能', requiresToken: true },
      },
      {
        path: 'message-test',
        name: 'MessageTest',
        component: () => import('@/components/Test/MessageTester.vue'),
        meta: { title: '消息测试', requiresToken: true },
      },
      {
        path: 'legion-war',
        name: 'LegionWar',
        component: () => import('@/views/LegionWar.vue'),
        meta: { title: '实时盐场', requiresToken: true },
      },
      {
        path: 'profile',
        name: 'Profile',
        component: () => import('@/views/Profile.vue'),
        meta: { title: '个人设置', requiresToken: true },
      },
      {
        path: 'daily-tasks',
        name: 'DailyTasks',
        component: () => import('@/views/DailyTasks.vue'),
        meta: { title: '日常任务', requiresToken: true },
      },
      {
        path: 'batch-daily-tasks',
        name: 'BatchDailyTasks',
        component: () => import('@/views/BatchDailyTasks.vue'),
        meta: { title: '批量日常', requiresToken: true },
      },
      ...generatedRoutes,
    ],
  },
  {
    path: '/websocket-test',
    name: 'WebSocketTest',
    component: () => import('@/components/Test/WebSocketTester.vue'),
    meta: { title: 'WebSocket测试', requiresToken: true },
  },
  { path: '/game-roles', redirect: '/tokens' },
  ...generatedRoutes,
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/NotFound.vue'),
    meta: { title: '页面不存在' },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes: my_routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition;
    return { top: 0 };
  },
});

router.beforeEach((to, from, next) => {
  document.title = to.meta.title
    ? `${to.meta.title} - XYZW 游戏管理系统`
    : 'XYZW 游戏管理系统';

  const hasAuth = !!getStoredToken();
  if (to.meta.requiresToken && !hasAuth) {
    next({ path: '/login', query: { redirect: to.fullPath } });
    return;
  }
  if (to.name === 'Login' && hasAuth) {
    next('/admin/dashboard');
    return;
  }

  if (to.meta.requiresToken) {
    const store = useTokensStore();
    if (!store.hasTokens && to.path !== '/tokens') {
      store.refresh().catch(() => undefined);
    }
  }
  next();
});

export default router;