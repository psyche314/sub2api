<template>
  <div class="settings-layout" @invalid.capture="revealInvalidField" @settings-reveal="revealTarget">
    <aside class="settings-sidebar">
      <p class="settings-nav-label">{{ t('settingsLayout.navigation') }}</p>
      <div role="tablist" :aria-label="t('settingsLayout.navigation')" class="settings-tabs">
        <button
          v-for="(section, index) in sections"
          :id="tabId(section.id)"
          :key="section.id"
          type="button"
          role="tab"
          :aria-selected="active === section.id"
          :aria-controls="panelId(section.id)"
          :tabindex="active === section.id ? 0 : -1"
          :class="['settings-tab', { 'is-active': active === section.id }]"
          @click="selectSection(section.id)"
          @keydown="navigateTabs($event, index)"
        >
          <span class="settings-tab-number" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
          <span class="min-w-0">
            <span class="block font-medium">{{ t('settingsLayout.' + section.id) }}</span>
            <span class="settings-tab-description">{{ t('settingsLayout.' + section.id + 'Hint') }}</span>
          </span>
        </button>
      </div>
    </aside>
    <div ref="scrollArea" class="settings-scroll-area">
      <section
        v-for="section in sections"
        v-show="active === section.id"
        :id="panelId(section.id)"
        :key="section.id"
        role="tabpanel"
        :aria-labelledby="tabId(section.id)"
        :data-settings-section="section.id"
        tabindex="0"
        class="settings-panel"
      >
        <header class="settings-panel-heading">
          <h4>{{ t('settingsLayout.' + section.id) }}</h4>
          <p>{{ t('settingsLayout.' + section.id + 'Hint') }}</p>
        </header>
        <div class="settings-fields"><slot :name="section.id" /></div>
      </section>
    </div>
  </div>
</template>

<script lang="ts">
let layoutCounter = 0
</script>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

export interface SettingsSection {
  id: string
}

const props = defineProps<{ sections: SettingsSection[]; resetKey?: string | number | boolean }>()
const { t } = useI18n()
const instanceId = ++layoutCounter
const active = ref(props.sections[0]?.id ?? '')
const scrollArea = ref<HTMLElement>()
const tabId = (id: string) => 'settings-' + instanceId + '-tab-' + id
const panelId = (id: string) => 'settings-' + instanceId + '-panel-' + id

function selectSection(id: string) {
  active.value = id
  if (scrollArea.value) scrollArea.value.scrollTop = 0
}

function revealTarget(event: Event) {
  const panel = (event.target as HTMLElement).closest<HTMLElement>('[data-settings-section]')
  if (panel?.dataset.settingsSection) selectSection(panel.dataset.settingsSection)
}

watch(() => props.resetKey, () => selectSection(props.sections[0]?.id ?? ''))
watch(() => props.sections.map(section => section.id), ids => {
  if (!ids.includes(active.value)) selectSection(ids[0] ?? '')
})

function navigateTabs(event: KeyboardEvent, index: number) {
  const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End']
  if (!keys.includes(event.key)) return
  event.preventDefault()
  const count = props.sections.length
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? count - 1
    : (index + (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1) + count) % count
  const id = props.sections[next].id
  selectSection(id)
  document.getElementById(tabId(id))?.focus()
}

// Native form validation still covers every mounted tab. Reveal the first
// invalid field before the browser tries to focus an otherwise hidden input.
let validationPending = false
let reportingValidity = false
function revealInvalidField(event: Event) {
  if (reportingValidity) return
  const input = event.target as HTMLInputElement
  const panel = input.closest<HTMLElement>('[data-settings-section]')
  if (!panel) return
  event.preventDefault()
  if (validationPending) return
  validationPending = true
  selectSection(panel.dataset.settingsSection!)
  void nextTick(() => {
    input.focus()
    reportingValidity = true
    input.reportValidity()
    reportingValidity = false
    validationPending = false
  })
}
</script>

<style>
.modal-content.settings-dialog {
  height: min(820px, calc(100dvh - 32px));
  max-height: calc(100dvh - 32px);
}
.modal-content.settings-dialog.drawer-content { height: 100dvh; max-height: 100dvh; }
.settings-dialog > .modal-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}
.settings-form { display: flex; flex: 1; min-height: 0; flex-direction: column; }
.settings-layout { display: flex; flex: 1; min-height: 0; min-width: 0; }
.settings-sidebar {
  @apply border-r border-gray-200 bg-gray-50/80 dark:border-dark-700 dark:bg-dark-900/40;
  width: 208px;
  flex-shrink: 0;
  padding: 20px 12px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.settings-nav-label { @apply mb-3 px-3 text-xs font-semibold tracking-wider text-gray-400 dark:text-gray-500; }
.settings-tabs { display: flex; flex-direction: column; gap: 4px; }
.settings-tab {
  @apply flex items-start gap-3 rounded-xl border border-transparent px-3 py-3 text-left text-sm text-gray-600 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-gray-400 dark:hover:bg-dark-700;
}
.settings-tab.is-active { @apply border-primary-200 bg-primary-50 text-primary-700 dark:border-primary-800/60 dark:bg-primary-900/30 dark:text-primary-300; }
.settings-tab-number { @apply mt-0.5 font-mono text-[10px] opacity-50; }
.settings-tab-description { @apply mt-1 block text-[11px] font-normal leading-relaxed opacity-70; }
.settings-scroll-area { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
.settings-panel { padding: 24px; outline: none; }
.settings-panel-heading { @apply mb-5 border-b border-gray-100 pb-4 dark:border-dark-700; }
.settings-panel-heading h4 { @apply text-base font-semibold text-gray-900 dark:text-white; }
.settings-panel-heading p { @apply mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400; }
.settings-fields { @apply space-y-4; }
.settings-fields > .border-t:first-child { border-top: 0; padding-top: 0; }
.settings-fields .input-hint { line-height: 1.6; }
@media (max-width: 639px) {
  .modal-content.settings-dialog { height: calc(100dvh - 16px); max-height: calc(100dvh - 16px); }
  .settings-layout { flex-direction: column; }
  .settings-sidebar { width: auto; padding: 8px 12px; overflow-x: auto; border-right: 0; border-bottom-width: 1px; }
  .settings-nav-label, .settings-tab-number, .settings-tab-description { display: none; }
  .settings-tabs { flex-direction: row; width: max-content; }
  .settings-tab { flex-shrink: 0; padding: 8px 12px; border-radius: 8px; }
  .settings-panel { padding: 16px; }
}
</style>
