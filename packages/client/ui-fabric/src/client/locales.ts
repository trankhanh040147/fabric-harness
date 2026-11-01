/** Fabric page copy in every shipped Web language. */

/** Locale namespace owned by this plugin. */
export const NS = 'ui-fabric'

/** English dictionary. */
export const en = {
  panel: 'Fabric',
  tabTitle: 'Fabric',
  title: 'Fabric',
  subtitle: 'Route model calls to agent-fabric workers, and watch the workers behind them.',
  engine: 'Fabric engine',
  engineOn: 'On',
  engineOff: 'Off',
  engineHint: 'When on, the model picker offers each peer as a model. When off, only DeepSeek models are available.',
  connected: 'MCP connected',
  disconnected: 'MCP disconnected',
  workers: 'Workers',
  noWorkers: 'No workers reported yet. Start agent-fabric workers, then refresh.',
  workerLiveness: 'liveness',
  workerBusy: 'busy',
  workerReplicas: 'replicas',
  dashboard: 'Dashboard',
  dashboardReachable: 'Ops dashboard reachable',
  dashboardUnreachable: 'Ops dashboard unreachable',
  overview: 'Overview',
  usage: 'Usage',
  routing: 'Routing',
  runs: 'Runs',
  models: 'Models offered',
  refresh: 'Refresh',
  loading: 'Loading…',
  failed: 'Fabric status request failed.',
  toggleFailed: 'Could not change the Fabric engine state.',
}

/** Fabric page keys. */

/** Chinese dictionary. */
export const zh: { readonly [K in FabricKey]: string } = {
  panel: 'Fabric',
  tabTitle: 'Fabric',
  title: 'Fabric',
  subtitle: '将模型调用路由到 agent-fabric 工作节点，并查看其状态。',
  engine: 'Fabric 引擎',
  engineOn: '开启',
  engineOff: '关闭',
  engineHint: '开启后，模型选择器会把每个 peer 作为模型提供；关闭后只提供 DeepSeek 模型。',
  connected: 'MCP 已连接',
  disconnected: 'MCP 未连接',
  workers: '工作节点',
  noWorkers: '暂无工作节点上报。请启动 agent-fabric worker 后刷新。',
  workerLiveness: '存活状态',
  workerBusy: '忙碌',
  workerReplicas: '副本',
  dashboard: '仪表盘',
  dashboardReachable: '运维仪表盘可达',
  dashboardUnreachable: '运维仪表盘不可达',
  overview: '总览',
  usage: '用量',
  routing: '路由',
  runs: '运行',
  models: '提供的模型',
  refresh: '刷新',
  loading: '加载中…',
  failed: 'Fabric 状态请求失败。',
  toggleFailed: '无法切换 Fabric 引擎状态。',
}

export type FabricKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Fabric page copy. */
    'ui-fabric': FabricKey
  }
}
