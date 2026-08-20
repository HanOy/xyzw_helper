<template>
  <div class="home-page">
    <!-- 导航栏 -->
    <nav class="navbar glass">
      <div class="container">
        <div class="nav-content">
          <div class="nav-brand">
            <img src="/icons/xiaoyugan.png" alt="XYZW" class="brand-logo" />
            <span class="brand-text">XYZW 游戏管理系统</span>
          </div>

          <div class="nav-actions">
            <template v-if="!authStore.isAuthenticated">
              <n-button
                type="primary"
                size="large"
                @click="router.push('/login')"
              >
                登录
              </n-button>
            </template>
            <template v-else>
              <n-button
                type="primary"
                size="large"
                @click="router.push('/admin/dashboard')"
              >
                进入控制台
              </n-button>
            </template>
          </div>
        </div>
      </div>
    </nav>

    <!-- 主要内容 -->
    <main class="main-content">
      <section class="hero-section">
        <div class="container">
          <div class="hero-content">
            <img src="/icons/xiaoyugan.png" alt="XYZW" class="hero-logo" />
            <h1 class="hero-title">XYZW 游戏管理系统</h1>
            <n-button
              type="primary"
              size="large"
              class="hero-button"
              @click="router.push(authStore.isAuthenticated ? '/admin/dashboard' : '/login')"
            >
              {{ authStore.isAuthenticated ? "进入控制台" : "登录" }}
            </n-button>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const router = useRouter();
const authStore = useAuthStore();

onMounted(() => {
  authStore.initAuth();
});
</script>

<style scoped lang="scss">
.home-page {
  min-height: 100dvh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  flex-direction: column;
  position: relative;
  overflow-x: hidden;
  padding-bottom: calc(var(--spacing-md) + env(safe-area-inset-bottom));
}

// 导航栏
.navbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: var(--z-fixed);
  padding: var(--spacing-md) 0;
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.nav-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.brand-logo {
  width: 32px;
  height: 32px;
  border-radius: var(--border-radius-small);
}

.brand-text {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: white;
}

.nav-actions {
  display: flex;
  gap: var(--spacing-sm);
}

// 主要内容
.main-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hero-section {
  padding: var(--spacing-2xl) 0;
}

.hero-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-lg);
  color: white;
  text-align: center;
}

.hero-logo {
  width: 96px;
  height: 96px;
  border-radius: var(--border-radius-large);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
}

.hero-title {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-bold);
  margin: 0;
}

.hero-button {
  padding: var(--spacing-md) var(--spacing-2xl);
  font-size: var(--font-size-lg);
}

// 响应式设计
@media (max-width: 640px) {
  .hero-title {
    font-size: var(--font-size-2xl);
  }
}
</style>