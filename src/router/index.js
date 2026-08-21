import { createRouter, createWebHistory } from 'vue-router';
import { useTokensStore } from '@/stores/tokens';
import { getStoredToken } from '@/api';

const generatedRoutes = [];

const my_routes = [
  {
    path: '/',
    redirect: '/login',
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { title: '登录' },
  },
  {
    name: 'DefaultLayout',
    path: '/admin',
    component: () => import('@/layout/DefaultLayout.vue'),
    children: [
      {
        path: '',
        redirect: '/admin/tokens',
      },
      {
        path: 'game-features',
        name: 'GameFeatures',
        component: () => import('@/views/GameFeatures.vue'),
        meta: { title: '游戏功能', requiresToken: true },
      },
      {
        path: 'tokens',
        name: 'TokenImport',
        component: () => import('@/views/TokenImport/index.vue'),
        meta: { title: 'Token管理', requiresToken: true },
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
        path: 'profile',
        name: 'Profile',
        component: () => import('@/views/Profile.vue'),
        meta: { title: '个人设置', requiresToken: true },
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
    path: '/game-roles',
    redirect: '/admin/tokens',
  },
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

router.beforeEach(async (to, from, next) => {
  document.title = to.meta.title
    ? `${to.meta.title} - XYZW 游戏管理系统`
    : 'XYZW 游戏管理系统';

  const hasAuth = !!getStoredToken();
  if (to.meta.requiresToken && !hasAuth) {
    next({ path: '/login', query: { redirect: to.fullPath } });
    return;
  }
  if (to.name === 'Login' && hasAuth) {
    next('/admin/tokens');
    return;
  }

  if (to.meta.requiresToken) {
    const store = useTokensStore();
    if (!store.hasTokens) {
      await store.refresh().catch(() => undefined);
    }
    const needsTokenPath = to.path === '/admin/game-features' || to.path === '/admin/batch-daily-tasks';
    if (needsTokenPath && !store.hasTokens) {
      next('/admin/tokens');
      return;
    }
  }
  next();
});

export default router;