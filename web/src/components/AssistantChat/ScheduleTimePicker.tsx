import { useMemo, useState } from 'react'
import { useTranslation } from '@/lib/use-translation'

export type PendingSchedule =
    | { type: 'preset'; preset: '+5m' | '+30m' | '+1h' | '+4h' }
    | { type: 'absolute'; ms: number }

export function parsePreset(preset: string, now: number): number {
    if (preset === '+5m') return now + 5 * 60 * 1000
    if (preset === '+30m') return now + 30 * 60 * 1000
    if (preset === '+1h') return now + 60 * 60 * 1000
    if (preset === '+4h') return now + 4 * 60 * 60 * 1000
    throw new Error(`Unknown preset: ${preset}`)
}

export function resolvePendingSchedule(pending: PendingSchedule | null, sendNow: number): number | null {
    if (pending === null) return null
    if (pending.type === 'preset') return parsePreset(pending.preset, sendNow)
    return pending.ms
}

export function validateSpecificDatetime(
    value: number,
    now: number
): 'scheduleErrorPast' | 'scheduleErrorTooFar' | null {
    const GRACE_MS = 30_000
    if (value < now - GRACE_MS) return 'scheduleErrorPast'
    const maxFuture = now + 7 * 24 * 60 * 60 * 1000
    if (value > maxFuture) return 'scheduleErrorTooFar'
    return null
}

function toLocalDateTimeValue(ms: number): string {
    const date = new Date(ms)
    const pad = (n: number) => String(n).padStart(2, '0')
    const year = date.getFullYear()
    const month = pad(date.getMonth() + 1)
    const day = pad(date.getDate())
    const hours = pad(date.getHours())
    const minutes = pad(date.getMinutes())
    return `${year}-${month}-${day}T${hours}:${minutes}`
}

export function ScheduleTimePicker(props: {
    pendingSchedule: PendingSchedule | null
    onSchedule: (pending: PendingSchedule) => void
    onClearSchedule: () => void
    disabled?: boolean
}) {
    const { t } = useTranslation()
    const [customValue, setCustomValue] = useState(() => props.pendingSchedule?.type === 'absolute' ? toLocalDateTimeValue(props.pendingSchedule.ms) : '')
    const [errorKey, setErrorKey] = useState<'scheduleErrorPast' | 'scheduleErrorTooFar' | null>(null)

    const presets = useMemo(() => ([
        { preset: '+5m' as const, label: t('composer.schedule.plus5m') },
        { preset: '+30m' as const, label: t('composer.schedule.plus30m') },
        { preset: '+1h' as const, label: t('composer.schedule.plus1h') },
        { preset: '+4h' as const, label: t('composer.schedule.plus4h') },
    ]), [t])

    return (
        <div className="mb-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-[var(--app-hint)]">{t('composer.schedule.title')}</div>
                {props.pendingSchedule ? (
                    <button
                        type="button"
                        onClick={props.onClearSchedule}
                        disabled={props.disabled}
                        className="text-xs text-[var(--app-link)] disabled:opacity-50"
                    >
                        {t('composer.schedule.clear')}
                    </button>
                ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {presets.map((item) => {
                    const active = props.pendingSchedule?.type === 'preset' && props.pendingSchedule.preset === item.preset
                    return (
                        <button
                            key={item.preset}
                            type="button"
                            disabled={props.disabled}
                            onClick={() => {
                                setErrorKey(null)
                                props.onSchedule({ type: 'preset', preset: item.preset })
                            }}
                            className={`rounded-lg px-3 py-2 text-xs transition-colors ${active ? 'bg-[var(--app-link)] text-white' : 'bg-[var(--app-bg)] text-[var(--app-fg)] hover:bg-[var(--app-border)]'} disabled:opacity-50`}
                        >
                            {item.label}
                        </button>
                    )
                })}
            </div>
            <div className="mt-3">
                <label className="mb-1 block text-xs text-[var(--app-hint)]" htmlFor="schedule-datetime-input">
                    {t('composer.schedule.custom')}
                </label>
                <input
                    id="schedule-datetime-input"
                    type="datetime-local"
                    value={customValue}
                    disabled={props.disabled}
                    min={toLocalDateTimeValue(Date.now())}
                    max={toLocalDateTimeValue(Date.now() + 7 * 24 * 60 * 60 * 1000)}
                    onChange={(event) => {
                        const value = event.target.value
                        setCustomValue(value)
                        if (!value) {
                            setErrorKey(null)
                            return
                        }
                        const ms = new Date(value).getTime()
                        const validation = validateSpecificDatetime(ms, Date.now())
                        setErrorKey(validation)
                        if (validation === null) {
                            props.onSchedule({ type: 'absolute', ms })
                        }
                    }}
                    className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 text-sm text-[var(--app-fg)] outline-none"
                />
                {errorKey ? (
                    <div className="mt-1 text-xs text-red-500">{t(`composer.${errorKey}`)}</div>
                ) : null}
            </div>
        </div>
    )
}
