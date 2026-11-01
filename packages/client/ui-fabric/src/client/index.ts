/**
 * Browser half of the Fabric page and tab: sidebar entries plus the right-sidebar
 * tab that read the host `/fabric/*` surface.
 * @module @deepseek-ai/dsh-client-ui-fabric/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import { FabricHeaderButton } from './FabricHeaderButton.tsx'
import { FabricIcon } from './FabricIcon.tsx'
import { FabricPage } from './FabricPage.tsx'
import { FabricSettingsSection } from './FabricSettingsSection.tsx'
import { FabricTab } from './FabricTab.tsx'
import { FabricTabTitle } from './FabricTabTitle.tsx'
import { de, en, es, fr, ja, NS, pt, ru, zh, type FabricKey } from './locales.ts'

const PANEL_ID = 'fabric' as MainPanelId
const TAB_ID = '@deepseek-ai/dsh-client-ui-fabric'

/** Required services for locale dictionaries and slots. */
export const inject = ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs']

/** Structural view of the sidebar-right tab registry this plugin contributes to. */
interface SidebarRightTabsFace {
  register(definition: Record<string, unknown>): () => void
}

/** Structural view of the sidebar-right opener this plugin calls. */
interface SidebarRightFace {
  openTab(kind: string): void
}

function sidebarTabs(ctx: ClientContext): SidebarRightTabsFace {
  return (ctx as unknown as { sidebarRightTabs: SidebarRightTabsFace }).sidebarRightTabs
}

function sidebarRight(ctx: ClientContext): SidebarRightFace {
  return (ctx as unknown as { sidebarRight: SidebarRightFace }).sidebarRight
}

/**
 * Register the Fabric panel entry, its main page, the right-sidebar tab, and the
 * Session-header opener.
 * @param ctx - browser services used by these contributions.
 */
function activate(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh, ja, es, fr, de, ru, pt }), 'ui-fabric: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    inject: (): Record<string, never> => ({}),
  }, FabricPage))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 20,
    locale: NS,
    label: () => t('panel'),
  }, FabricIcon))
  ctx.effect(() => sidebarTabs(ctx).register({
    id: TAB_ID,
    kind: 'fabric',
    multiple: false,
    priority: 'builtin',
    title: () => t('tabTitle'),
  }), 'ui-fabric: tab type')
  ctx.slots.inject('sidebar.right.pane.tab' as never, () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: TAB_ID,
    locale: NS,
  } as never, FabricTab))
  ctx.slots.inject('sidebar.right.pane.tab.title' as never, () => ctx.slots.register({
    name: 'sidebar.right.pane.tab.title',
    key: TAB_ID,
    locale: NS,
  } as never, FabricTabTitle))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'fabric',
    order: 60,
    label: () => t('nav'),
    locale: NS,
  } as never, FabricSettingsSection))
  ctx.slots.inject('conversation.session.header.utilities' as never, () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'fabric-open',
    order: -6,
    locale: NS,
    inject: () => ({ open: () => { sidebarRight(ctx).openTab('fabric') } }),
  } as never, FabricHeaderButton))
}

export type { FabricKey }

/**
 * Activate the Fabric contributions, surfacing the first failure with context.
 * @param ctx - browser services used by these contributions.
 */
export function apply(ctx: ClientContext): void {
  try {
    activate(ctx)
  } catch (error) {
    console.error('[ui-fabric] activation failed', error)
    throw error
  }
}
