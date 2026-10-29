'use client'

import { useEffect, useState } from 'react'
import { useOffice } from '@/lib/store'

/**
 * Office name editor (poin 1).
 *
 * Opened by clicking the name plate above the entrance. The value is stored in
 * `office_meta` (data/office.db), so it survives a reload and belongs to the office
 * rather than to one browser.
 */
export default function OfficeNameDialog({ onClose }: { onClose: () => void }) {
  const officeName = useOffice((s) => s.officeName)
  const setOfficeName = useOffice((s) => s.setOfficeName)
  const [value, setValue] = useState(officeName)
  const [busy, setBusy] = useState(false)

  useEffect(() => setValue(officeName), [officeName])

  async function save() {
    setBusy(true)
    await setOfficeName(value)
    setBusy(false)
    onClose()
  }

  return (
    <div className="vp-modal-backdrop" onClick={onClose}>
      <div className="vp-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Nome do escritório</h3>
        <p className="vp-sub">Aparece na placa acima da entrada. Fica salvo no banco do escritório.</p>
        <label className="vp-field">
          <span>Nome</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={60}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save()
            }}
          />
        </label>
        <div className="vp-modal-actions">
          <button className="vp-btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="vp-btn primary" onClick={() => void save()} disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
