<template>
  <div class="wx-qrcode-import">
    <!-- 微信登录流程说明 -->
    <div class="login-flow-info">
      <h3>微信扫码登录流程</h3>
      <ol class="flow-steps">
        <li>点击下方按钮获取微信登录二维码</li>
        <li>使用微信扫码并确认登录</li>
        <li>
          系统将获取<strong>该微信下所有角色</strong>的Token信息
        </li>
      </ol>
    </div>

    <!-- 二维码显示区域 -->
    <div class="qrcode-container">
      <div v-if="!qrcodeUrl" id="qr-placeholder" class="qr-placeholder" @click="generateQRCode">
        <n-icon size="48" color="var(--text-tertiary)">
          <Scan />
        </n-icon>
        <p>点击获取微信登录二维码</p>
      </div>
      <img v-else id="qr-image" :src="qrcodeUrl" alt="微信登录二维码" class="qr-image" />

      <!-- 状态信息 -->
      <div id="qr-status" class="qr-status" :class="statusType">
        {{ statusMessage }}
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="form-actions">
      <n-button type="primary" block @click="generateQRCode" :loading="isProcessing">
        <template #icon>
          <n-icon>
            <Refresh />
          </n-icon>
        </template>
        {{ qrcodeUrl ? "刷新二维码" : "获取二维码" }}
      </n-button>
    </div>

    <!-- 角色命名格式配置 -->
    <n-form :model="importForm" label-placement="top" :show-label="true" style="margin-top: 16px;">
      <n-form-item label="角色命名格式" :show-label="true">
        <n-input v-model:value="importForm.nameTemplate" placeholder="{name}-{index}-{id}" />
        <template #feedback>
          支持变量: {name}角色名, {id}角色ID, {index}角色序号, {server}区服
        </template>
      </n-form-item>
    </n-form>

    <!-- 服务器角色列表 -->
    <div v-if="serverListData.length > 0" class="role-list">
      <h4>服务器角色列表（共 {{ serverListData.length }} 个）</h4>
      <n-list bordered>
        <n-list-item v-for="role in serverListData" :key="role.roleId">
          <div class="role-item">
            <div class="role-info">
              <strong>{{ role.name || "未命名角色" }}</strong>
              <span>ID: {{ role.roleId }}</span>
              <span>{{ role.server }}</span>
              <span v-if="role.power">战力: {{ role.power }}</span>
            </div>
            <n-button size="small" type="primary" @click="addSelectedRole(role)">添加</n-button>
          </div>
        </n-list-item>
      </n-list>
    </div>

    <!-- 已选角色 -->
    <n-list v-if="roleList.length > 0" bordered>
      <n-list-item v-for="(role, index) in roleList" :key="index">
        <div class="role-item">
          <div class="role-info">
            <strong>角色名称:</strong> {{ role.name }}<br />
            <strong>服务器:</strong> {{ role.server }}<br />
            <strong>角色序号:</strong> {{ role.roleIndex }}
          </div>
          <n-button type="error" size="small" @click="removeRole(index)">删除</n-button>
        </div>
      </n-list-item>
    </n-list>

    <!-- 操作按钮 -->
    <div class="form-actions">
      <n-button type="primary" size="large" block :loading="isImporting" @click="handleImport">
        <template #icon>
          <n-icon>
            <CloudUpload />
          </n-icon>
        </template>
        添加Token
      </n-button>

      <n-button block @click="$emit('cancel')" :disabled="isProcessing">
        <template #icon>
          <n-icon>
            <Close />
          </n-icon>
        </template>
        取消
      </n-button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, reactive, onUnmounted } from "vue";
import { Scan, Refresh, Close, CloudUpload } from "@vicons/ionicons5";
import { useMessage } from "naive-ui";
import { useTokensStore } from "@/stores/tokens";
import { api } from "@/api";

const tokensStore = useTokensStore();
const message = useMessage();

const emit = defineEmits(["cancel", "ok"]);

interface RoleInfo {
  roleId: string;
  name: string;
  serverId: number;
  server: string;
  roleIndex: number;
  power?: number;
}

interface PendingRole {
  roleId: string;
  name: string;
  server: string;
  serverId: number;
  roleIndex: number;
}

// 响应式数据
const qrcodeUrl = ref<string | null>(null);
const qrcodeUUID = ref<string | null>(null);
const isProcessing = ref(false);
const statusMessage = ref("点击获取微信登录二维码");
const statusType = ref("info");
const isScanning = ref(false);
const scanInterval = ref<any>(null);
const timeout = 120000; // 120秒超时
const startTime = ref<number | null>(null);

const importForm = reactive({
  nameTemplate: "{name}-{index}-{id}",
});

const bin = ref<string | null>(null);
const serverListData = ref<RoleInfo[]>([]);
const roleList = ref<PendingRole[]>([]);
const isImporting = ref(false);

const removeRole = (index: number) => {
  roleList.value.splice(index, 1);
};

/**
 * 生成微信登录二维码
 */
const generateQRCode = async () => {
  try {
    isProcessing.value = true;
    updateStatus("正在获取二维码...", "info");

    // 重置状态
    resetQRCode();
    bin.value = null;
    serverListData.value = [];
    roleList.value = [];

    const success = await tryGetWeixinQR();

    if (!success) {
      throw new Error("二维码获取失败");
    }
  } catch (error: any) {
    updateStatus("二维码获取失败：" + error.message, "error");
    console.error("获取二维码失败:", error);
  } finally {
    isProcessing.value = false;
  }
};

/**
 * 尝试获取微信二维码
 */
const tryGetWeixinQR = async () => {
  try {
    const qrPageUrl =
      "/api/weixin/connect/app/qrconnect" +
      "?appid=wxfb0d5667e5cb1c44" +
      "&bundleid=com.hortor.games.xyzw" +
      "&scope=snsapi_base,snsapi_userinfo,snsapi_friend,snsapi_message" +
      "&state=weixin";

    const response = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", qrPageUrl, true);
      xhr.timeout = 15000;
      xhr.setRequestHeader("Accept", "text/html");
      xhr.onload = () => resolve(xhr);
      xhr.onerror = () => reject(new Error("网络错误"));
      xhr.ontimeout = () => reject(new Error("请求超时"));
      xhr.send();
    });

    if (response.status !== 200) {
      throw new Error("HTTP 状态码：" + response.status);
    }

    const html = response.responseText;
    const doc = new DOMParser().parseFromString(html, "text/html");

    let qrUrl = doc.querySelector("img.auth_qrcode")?.src;

    if (!qrUrl) {
      const m = html.match(/https:\/\/[^"']*qrcode[^"']*/i);
      if (m) qrUrl = m[0];
    }

    if (!qrUrl) {
      throw new Error("未找到二维码图片地址");
    }

    // 解析 uuid
    const filename = qrUrl.split("/").pop().split("?")[0];
    qrcodeUUID.value = filename;
    qrcodeUrl.value = `/api/weixin/connect/qrcode/${filename}`;

    // 更新状态
    updateStatus("请使用微信扫码登录", "success");

    // 开始轮询扫码状态
    startScanMonitoring();
    return true;
  } catch (err: any) {
    console.error("二维码解析失败:", err);
    updateStatus("二维码获取失败：" + err.message, "error");
    return false;
  }
};

/**
 * 开始轮询扫码状态
 */
const startScanMonitoring = () => {
  if (isScanning.value) return;

  isScanning.value = true;
  startTime.value = Date.now();

  scanInterval.value = setInterval(() => {
    checkScanStatus();
  }, 1000);
};

/**
 * 检查扫码状态
 */
const checkScanStatus = async () => {
  try {
    if (!qrcodeUUID.value) return;

    const elapsed = Date.now() - startTime.value;
    if (elapsed > timeout) {
      updateStatus("二维码已超时，请重新获取", "error");
      stopScanMonitoring();
      resetQRCode();
      return;
    }

    // 使用微信官方推荐的扫码状态轮询路径
    const url =
      "/api/weixin/connect/l/qrconnect?uuid=" +
      qrcodeUUID.value +
      "&f=url&_=" +
      Date.now();

    const res = await new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.timeout = 5000;
      xhr.setRequestHeader("Accept", "*/*");
      xhr.onload = () => resolve(xhr);
      xhr.onerror = () => resolve({ status: 0 });
      xhr.ontimeout = () => resolve({ status: 0 });
      xhr.send();
    });

    if (res.status === 200) {
      const text = res.responseText;

      // 405 → 扫码确认
      if (text.includes("window.wx_errcode=405")) {
        // 提取code
        const codeMatch = text.match(
          /wx_redirecturl='[^']*code=([a-zA-Z0-9]+)/,
        );
        // 提取nickname
        const nicknameMatch = text.match(
          /window\.wx_nickname\s*=\s*['"]([^'"]+)['"]/,
        );

        if (codeMatch) {
          const code = codeMatch[1];
          const nickname = nicknameMatch ? nicknameMatch[1] : "";

          stopScanMonitoring();
          updateStatus(
            `扫码成功，正在登录... 用户：${nickname || "未知用户"}`,
            "success",
          );
          await handleScanSuccess(code, nickname);
          return;
        }
      }

      // 408 → 已过期
      if (text.includes("window.wx_errcode=408")) {
        updateStatus("二维码已过期，请重新生成", "error");
        stopScanMonitoring();
        resetQRCode();
        return;
      }
    }

    // 每30秒提醒一次
    const remain = Math.ceil((timeout - elapsed) / 1000);
    if (remain % 30 === 0) {
      updateStatus(`请扫码，剩余 ${remain} 秒`, "info");
    }
  } catch (err) {
    console.error("扫码状态检查失败:", err);
  }
};

/**
 * 停止扫码监控
 */
const stopScanMonitoring = () => {
  isScanning.value = false;
  if (scanInterval.value) {
    clearInterval(scanInterval.value);
    scanInterval.value = null;
  }
};

/**
 * 处理扫码成功：后端登录并返回角色列表
 */
const handleScanSuccess = async (code: string, nickname = "") => {
  try {
    isProcessing.value = true;
    updateStatus(`扫码成功，正在登录... 用户：${nickname || "未知用户"}`, "success");

    const resp = await api.weixin.login(code);
    bin.value = resp.data.bin as string;
    serverListData.value = (resp.data.roles ?? []) as RoleInfo[];

    if (serverListData.value.length === 0) {
      updateStatus("登录成功，但未找到角色", "info");
      message.warning("未找到该账号下的角色");
    } else {
      updateStatus("登录成功，请选择角色", "success");
      message.success("登录成功，请选择角色添加");
    }
  } catch (err: any) {
    updateStatus("处理失败：" + err.message, "error");
    console.error("扫码处理失败:", err);
  } finally {
    isProcessing.value = false;
  }
};

const addSelectedRole = (roleInfo: RoleInfo) => {
  if (!bin.value) {
    message.error("登录数据缺失，请重新扫码");
    return;
  }

  const roleName = roleInfo.name || `角色_${roleInfo.roleId}`;
  const template = importForm.nameTemplate || "{name}-{index}-{id}";
  const finalName = template
    .replace(/{name}/g, () => roleName)
    .replace(/{index}/g, () => String(roleInfo.roleIndex))
    .replace(/{id}/g, () => String(roleInfo.roleId))
    .replace(/{server}/g, () => roleInfo.server);

  const exists = roleList.value.some(
    (r) => r.roleId === roleInfo.roleId && r.name === finalName,
  );

  if (exists) {
    message.warning(`角色 ${finalName} 已在待添加列表中`);
    return;
  }

  roleList.value.push({
    roleId: roleInfo.roleId,
    name: finalName,
    server: roleInfo.server,
    serverId: roleInfo.serverId,
    roleIndex: roleInfo.roleIndex,
  });

  message.success(`已添加角色: ${finalName}`);
};

const handleImport = async () => {
  if (roleList.value.length === 0) {
    message.error("请先添加角色！");
    return;
  }
  if (!bin.value) {
    message.error("登录数据缺失，请重新扫码");
    return;
  }
  try {
    isImporting.value = true;
    const result = await tokensStore.importToken({
      method: "wxQrcode",
      names: roleList.value,
      bin: bin.value,
    });
    message.success(`成功导入 ${result.length} 个 Token`);
    emit("ok");
  } catch (e: any) {
    console.error("批量导入失败", e);
    message.error("导入失败: " + (e.message ?? e));
  } finally {
    isImporting.value = false;
  }
};

/**
 * 更新状态信息
 */
const updateStatus = (msg: string, type = "info") => {
  statusMessage.value = msg;
  statusType.value = type;
};

/**
 * 重置二维码状态
 */
const resetQRCode = () => {
  stopScanMonitoring();
  qrcodeUUID.value = null;
  qrcodeUrl.value = null;
  updateStatus("点击获取微信登录二维码", "info");
};

onUnmounted(() => {
  stopScanMonitoring();
});
</script>

<style scoped lang="scss">
.wx-qrcode-import {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  padding: var(--spacing-lg) 0;
}

.login-flow-info {
  background: var(--bg-tertiary);
  border-radius: var(--border-radius-medium);
  padding: var(--spacing-md);

  h3 {
    margin: 0 0 var(--spacing-sm) 0;
    color: var(--text-primary);
    font-size: var(--font-size-md);
  }

  .flow-steps {
    margin: 0;
    padding-left: var(--spacing-lg);
    color: var(--text-secondary);

    li {
      margin-bottom: var(--spacing-xs);
      font-size: var(--font-size-sm);
    }
  }
}

.qrcode-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-xl) 0;
}

.qr-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 200px;
  height: 200px;
  border: 2px dashed var(--border-light);
  border-radius: var(--border-radius-medium);
  cursor: pointer;
  transition: all var(--transition-normal);
  background: var(--bg-tertiary);

  &:hover {
    border-color: var(--primary-color);
    background: rgba(102, 126, 234, 0.05);
  }

  p {
    margin: var(--spacing-sm) 0 0 0;
    color: var(--text-tertiary);
    font-size: var(--font-size-sm);
  }
}

.qr-image {
  width: 200px;
  height: 200px;
  border: 2px solid var(--border-light);
  border-radius: var(--border-radius-medium);
  cursor: pointer;
  transition: all var(--transition-normal);

  &:hover {
    border-color: var(--primary-color);
    box-shadow: var(--shadow-small);
  }
}

.qr-status {
  margin-top: var(--spacing-xs);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  text-align: center;
  padding: var(--spacing-xs) var(--spacing-md);
  border-radius: var(--border-radius-small);

  &.info {
    color: var(--text-secondary);
    background: var(--bg-tertiary);
  }

  &.success {
    color: var(--success-color);
    background: rgba(16, 185, 129, 0.1);
  }

  &.error {
    color: var(--error-color);
    background: rgba(239, 68, 68, 0.1);
  }
}

.role-list {
  h4 {
    margin: var(--spacing-md) 0 var(--spacing-sm);
    color: var(--text-primary);
    font-size: var(--font-size-md);
  }
}

.role-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  width: 100%;

  .role-info {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--spacing-sm);
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
  }
}

.form-actions {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  margin-top: var(--spacing-xl);
}
</style>