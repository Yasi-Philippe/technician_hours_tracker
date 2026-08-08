import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, defaultSettings, loadPack, loadSettings, saveSettings } from './db'
import { strings } from './i18n'
import { todayISO } from './lib/dates'
import type { Settings } from './types'
import { Icon, Toast, useToast } from './components/ui'
import Onboarding from './screens/Onboarding'
import DayScreen from './screens/DayScreen'
import WeekScreen from './screens/WeekScreen'
import StatsScreen from './screens/StatsScreen'
import SettingsScreen from './screens/SettingsScreen'

export type TabId = 'day' | 'week' | 'stats' | 'settings'

/**
 * There is no router.
 *
 * The app has four screens and lives under an unpredictable base path — GitHub Pages
 * today, an intranet folder or a USB stick tomorrow. View state avoids the whole class of
 * problems that history routing brings to a static host, and costs nothing at this size.
 */
export default function App() {
  const [tab, setTab] = useState<TabId>('day')
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const toast = useToast()

  const settings = useLiveQuery(loadSettings, [], undefined)
  const pack = useLiveQuery(loadPack, [], undefined)
  const entryCount = useLiveQuery(() => db.entries.count(), [], 0)

  const update = useCallback(
    async (patch: Partial<Settings>) => {
      const current = (await loadSettings()) ?? defaultSettings()
      await saveSettings({ ...current, ...patch })
    },
    [],
  )

  // The interface language follows the technician, so the document should say so too.
  useEffect(() => {
    if (settings) document.documentElement.lang = settings.language
  }, [settings])

  const t = useMemo(() => strings(settings?.language ?? 'it'), [settings?.language])

  // Still opening the database. A flash of the wrong screen is worse than a blank one.
  if (settings === undefined) return <div className="app" />

  if (!settings.onboardingComplete) {
    return <Onboarding settings={settings} pack={pack ?? null} onUpdate={update} />
  }

  const shared = {
    settings,
    pack: pack ?? null,
    t,
    selectedDate,
    onSelectDate: setSelectedDate,
    onUpdateSettings: update,
    onToast: toast.show,
    entryCount: entryCount ?? 0,
  }

  return (
    <div className="app">
      {tab === 'day' ? <DayScreen {...shared} /> : null}
      {tab === 'week' ? <WeekScreen {...shared} onGoToDay={(d) => {
        setSelectedDate(d)
        setTab('day')
      }} /> : null}
      {tab === 'stats' ? <StatsScreen {...shared} /> : null}
      {tab === 'settings' ? <SettingsScreen {...shared} /> : null}

      <nav className="tabbar">
        <TabButton id="day" current={tab} onSelect={setTab} icon="day" label={t.navToday} />
        <TabButton id="week" current={tab} onSelect={setTab} icon="week" label={t.navWeek} />
        <TabButton id="stats" current={tab} onSelect={setTab} icon="stats" label={t.navStats} />
        <TabButton
          id="settings"
          current={tab}
          onSelect={setTab}
          icon="settings"
          label={t.navSettings}
        />
      </nav>

      {toast.toast ? <Toast toast={toast.toast} onDismiss={toast.dismiss} /> : null}
    </div>
  )
}

function TabButton({
  id,
  current,
  onSelect,
  icon,
  label,
}: {
  id: TabId
  current: TabId
  onSelect: (id: TabId) => void
  icon: 'day' | 'week' | 'stats' | 'settings'
  label: string
}) {
  const active = id === current
  return (
    <button
      type="button"
      className={`tab${active ? ' is-active' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={() => onSelect(id)}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  )
}
