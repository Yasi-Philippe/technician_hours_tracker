/**
 * First run.
 *
 * Three short steps, each asking one thing. No account, no password, nothing to accept.
 * The company file comes last because it is the only step that can fail, and by then the
 * technician has invested nothing but two taps.
 */

import { useState, type ReactNode } from 'react'
import type { CompanyPack, Language, Settings } from '../types'
import { LANGUAGE_NAMES, strings } from '../i18n'
import { Credit, Field } from '../components/ui'
import { PackLoader } from '../components/PackLoader'

export default function Onboarding({
  settings,
  pack,
  onUpdate,
}: {
  settings: Settings
  pack: CompanyPack | null
  onUpdate: (patch: Partial<Settings>) => Promise<void>
}) {
  const [step, setStep] = useState<'language' | 'name' | 'pack'>('language')
  const [name, setName] = useState(settings.technician.name)
  const [email, setEmail] = useState(settings.technician.email)
  const [error, setError] = useState('')

  const t = strings(settings.language)

  if (step === 'language') {
    return (
      <Shell
        t={t}
        title={t.welcomeTitle}
        body={t.welcomeBody}
        footer={
          <button type="button" className="btn btn-dark btn-lg" onClick={() => setStep('name')}>
            {t.continue}
          </button>
        }
      >
        <Field label={t.chooseLanguage}>
          <div className="options">
            {(Object.keys(LANGUAGE_NAMES) as Language[]).map((code) => (
              <button
                key={code}
                type="button"
                className={`option${settings.language === code ? ' is-selected' : ''}`}
                onClick={() => void onUpdate({ language: code })}
              >
                {LANGUAGE_NAMES[code]}
              </button>
            ))}
          </div>
        </Field>
      </Shell>
    )
  }

  if (step === 'name') {
    const submit = () => {
      if (name.trim() === '') {
        setError(t.nameRequired)
        return
      }
      void onUpdate({
        technician: { name: name.trim(), email: resolveEmail(email, pack?.emailDomain ?? '') },
      })
      setStep('pack')
    }

    return (
      <Shell
        t={t}
        title={t.yourName}
        body=""
        footer={
          <button type="button" className="btn btn-dark btn-lg" onClick={submit}>
            {t.continue}
          </button>
        }
      >
        <Field label={t.yourName}>
          <input
            className="input"
            value={name}
            placeholder={t.yourNamePlaceholder}
            autoComplete="name"
            autoFocus
            onChange={(e) => {
              setName(e.target.value)
              setError('')
            }}
          />
        </Field>
        <Field label={t.yourEmail}>
          <input
            className="input"
            value={email}
            placeholder={t.yourEmailPlaceholder}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        {error ? <p className="error">{error}</p> : null}
      </Shell>
    )
  }

  // The company file is genuinely useful but not a gate. Blocking here would leave a
  // technician who has not been sent the file yet unable to record anything at all.
  return (
    <Shell
      t={t}
      title={t.needCompanyFileTitle}
      body={t.needCompanyFileBody}
      footer={
        <div className="stack">
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => void onUpdate({ onboardingComplete: true })}
          >
            {pack ? t.start : t.skipForNow}
          </button>
        </div>
      }
    >
      <PackLoader t={t} label={t.loadCompanyFile} />
      {pack ? null : <p className="hint">{t.packOptionalHint}</p>}
    </Shell>
  )
}

/** A bare username plus the company domain is one less thing to type wrong. */
function resolveEmail(input: string, domain: string): string {
  const value = input.trim()
  if (value === '' || value.includes('@') || domain === '') return value
  return `${value}${domain.startsWith('@') ? domain : `@${domain}`}`
}

function Shell({
  t,
  title,
  body,
  children,
  footer,
}: {
  t: ReturnType<typeof strings>
  title: string
  body: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="app">
      <div className="screen" style={{ paddingBottom: 0 }}>
        <div className="onboarding">
          <div className="onboarding-body">
            <div className="onboarding-mark" />
            <h1>{title}</h1>
            {body ? <p>{body}</p> : null}
            {children}
          </div>
          <div className="onboarding-foot">{footer}</div>
          <Credit text={t.credit} />
        </div>
      </div>
    </div>
  )
}
