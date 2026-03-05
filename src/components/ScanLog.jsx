import { useState, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { formatTimestamp, getProductType, getProductPrefix, detectCarrier } from '../utils/helpers'

const statusColors = {
  OK: 'text-moss',
  Escalated: 'text-terra',
  Discard: 'text-terra font-bold',
}

const typeIcons = {
  Tracking: 'TRK',
  Serial: 'SER',
  'Manual Note': 'MAN',
}

function FlatRow({ scan, isNewest, onRemove, onToggleEscalation }) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-lg bg-deako-black/40 border border-air-blue/10
        ${isNewest ? (scan.status === 'OK' ? 'flash-success' : 'flash-error') : ''}`}
    >
      <span className={`text-xs font-bold px-2 py-1 rounded ${
        scan.scanType === 'Tracking' ? 'bg-air-blue/20 text-air-blue' :
        scan.scanType === 'Serial' ? 'bg-moss/20 text-moss' :
        'bg-beige/20 text-beige'
      }`}>
        {typeIcons[scan.scanType] || 'UNK'}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-mono text-sm text-white truncate">{scan.value}</div>
        <div className="flex gap-2">
          {scan.scanType === 'Serial' && (
            <>
              <span className="text-xs text-air-blue/70">{getProductType(scan.value)}</span>
              <span className="text-xs text-air-blue/40">Prefix: {getProductPrefix(scan.value)}</span>
            </>
          )}
          {scan.scanType !== 'Tracking' && scan.trackingNumber && (
            <span className="text-xs text-air-blue/40">TRK: {scan.trackingNumber}</span>
          )}
        </div>
      </div>
      <span className={`text-xs font-medium ${statusColors[scan.status] || 'text-white'}`}>
        {scan.status}
      </span>
      {onToggleEscalation && scan.scanType === 'Serial' && scan.status !== 'Discard' && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleEscalation(scan.id) }}
          className={`text-xs px-2 py-0.5 rounded border transition ${
            scan.status === 'Escalated'
              ? 'border-terra/40 text-terra hover:bg-terra/10'
              : 'border-terra/20 text-terra/40 hover:text-terra hover:border-terra/40'
          }`}
        >
          {scan.status === 'Escalated' ? 'Unflag' : 'Escalate'}
        </button>
      )}
      {onRemove && scan.scanType === 'Serial' && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(scan.id) }}
          className="text-xs px-2 py-0.5 rounded border border-terra/20 text-terra/50 hover:text-terra hover:border-terra/40 transition"
        >
          Remove
        </button>
      )}
      <span className="text-xs text-air-blue/40">{formatTimestamp(scan.timestamp)}</span>
    </div>
  )
}

function VirtualFlatList({ scans, onRemove, onToggleEscalation }) {
  const reversed = [...scans].reverse()
  const parentRef = useRef(null)
  const virtualizer = useVirtualizer({
    count: reversed.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 62,
    overscan: 5,
  })

  return (
    <div ref={parentRef} className="max-h-[400px] overflow-y-auto pr-1">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map(virtualRow => {
          const scan = reversed[virtualRow.index]
          return (
            <div
              key={scan.id || virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div style={{ paddingBottom: 8 }}>
                <FlatRow
                  scan={scan}
                  isNewest={virtualRow.index === 0}
                  onRemove={onRemove}
                  onToggleEscalation={onToggleEscalation}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const VIRTUALIZE_THRESHOLD = 20

function VirtualGroupItems({ items, newestId, onRemoveSerial, onToggleEscalation }) {
  const parentRef = useRef(null)
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 46,
    overscan: 5,
  })

  return (
    <div
      ref={parentRef}
      className="overflow-y-auto"
      style={{ maxHeight: 400 }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map(virtualRow => {
          const scan = items[virtualRow.index]
          return (
            <div
              key={scan.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <GroupItemRow
                scan={scan}
                isNewest={scan.id === newestId}
                onRemoveSerial={onRemoveSerial}
                onToggleEscalation={onToggleEscalation}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function GroupItemRow({ scan, isNewest, onRemoveSerial, onToggleEscalation }) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 pl-10 bg-deako-black/30
        ${isNewest ? (scan.status === 'OK' ? 'flash-success' : 'flash-error') : ''}`}
    >
      <span className={`text-xs font-bold px-2 py-0.5 rounded ${
        scan.scanType === 'Serial' ? 'bg-moss/20 text-moss' : 'bg-beige/20 text-beige'
      }`}>
        {typeIcons[scan.scanType] || 'UNK'}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-mono text-sm text-white truncate">{scan.value}</div>
        {scan.scanType === 'Serial' && (
          <div className="flex gap-2">
            <span className="text-xs text-air-blue/70">{getProductType(scan.value)}</span>
            <span className="text-xs text-air-blue/40">Prefix: {getProductPrefix(scan.value)}</span>
          </div>
        )}
      </div>
      <span className={`text-xs font-medium ${statusColors[scan.status] || 'text-white'}`}>
        {scan.status}
      </span>
      {onToggleEscalation && scan.scanType === 'Serial' && scan.status !== 'Discard' && (
        <button
          onClick={() => onToggleEscalation(scan.id)}
          className={`text-xs px-2 py-0.5 rounded border transition ${
            scan.status === 'Escalated'
              ? 'border-terra/40 text-terra hover:bg-terra/10'
              : 'border-terra/20 text-terra/40 hover:text-terra hover:border-terra/40'
          }`}
        >
          {scan.status === 'Escalated' ? 'Unflag' : 'Escalate'}
        </button>
      )}
      {onRemoveSerial && scan.scanType === 'Serial' && (
        <button
          onClick={() => onRemoveSerial(scan.id)}
          className="text-xs px-2 py-0.5 rounded border border-terra/20 text-terra/50 hover:text-terra hover:border-terra/40 transition"
        >
          Remove
        </button>
      )}
      <span className="text-xs text-air-blue/40">{formatTimestamp(scan.timestamp)}</span>
    </div>
  )
}

function GroupedView({ scans, currentTracking, onRemoveSerial, onRemoveTrackingGroup, onSelectTracking, onToggleEscalation }) {
  const groups = []
  let current = null

  for (const scan of scans) {
    if (scan.scanType === 'Tracking') {
      current = { tracking: scan, items: [] }
      groups.push(current)
    } else if (current) {
      current.items.push(scan)
    } else {
      if (!groups.length || groups[0].tracking !== null) {
        groups.unshift({ tracking: null, items: [] })
      }
      groups[0].items.push(scan)
    }
  }

  const newestId = scans.length ? scans[scans.length - 1].id : null

  return (
    <div className="space-y-4">
      {[...groups].reverse().map((group, gi) => {
        const serialCount = group.items.filter(s => s.scanType === 'Serial').length
        const hasEscalated = group.items.some(s => s.status === 'Escalated')
        const hasDiscard = group.items.some(s => s.status === 'Discard')
        const isActive = group.tracking && currentTracking === group.tracking.value

        return (
          <div key={group.tracking?.id || `ungrouped-${gi}`} className={`rounded-xl border overflow-hidden ${
            isActive ? 'border-air-blue/40' : 'border-air-blue/15'
          }`}>
            {/* Group header — clickable */}
            <div
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition ${
                hasEscalated ? 'bg-terra/10 border-b border-terra/20 hover:bg-terra/15' :
                hasDiscard ? 'bg-terra/5 border-b border-terra/10 hover:bg-terra/10' :
                isActive ? 'bg-air-blue/15 border-b border-air-blue/30 hover:bg-air-blue/20' :
                'bg-air-blue/10 border-b border-air-blue/15 hover:bg-air-blue/15'
              }`}
              onClick={() => group.tracking && onSelectTracking?.(group.tracking.value)}
              title={group.tracking ? 'Click to set as active tracking' : undefined}
            >
              <span className="text-xs font-bold px-2 py-1 rounded bg-air-blue/20 text-air-blue">TRK</span>
              <div className="flex-1 min-w-0">
                <span className="font-mono text-sm text-white">
                  {group.tracking ? group.tracking.value : 'No Tracking'}
                </span>
                {group.tracking && (
                  <span className="ml-2 text-xs text-moss/80 font-medium">
                    {group.tracking.carrier || detectCarrier(group.tracking.value)}
                  </span>
                )}
                {isActive && (
                  <span className="ml-2 text-xs text-air-blue font-medium">ACTIVE</span>
                )}
              </div>
              <span className="text-xs font-medium text-air-blue/70">
                {serialCount} serial{serialCount !== 1 ? 's' : ''}
              </span>
              {hasEscalated && (
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-terra/20 text-terra">ESCALATED</span>
              )}
              {hasDiscard && (
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-terra/20 text-terra">DISCARD</span>
              )}
              {group.tracking && onRemoveTrackingGroup && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemoveTrackingGroup(group.tracking.value) }}
                  className="text-xs px-2 py-0.5 rounded border border-terra/20 text-terra/50 hover:text-terra hover:border-terra/40 transition"
                  title="Remove tracking group"
                >
                  Remove Group
                </button>
              )}
              {group.tracking && (
                <span className="text-xs text-air-blue/40">{formatTimestamp(group.tracking.timestamp)}</span>
              )}
            </div>

            {/* Items under this tracking */}
            {group.items.length > VIRTUALIZE_THRESHOLD ? (
              <VirtualGroupItems
                items={group.items}
                newestId={newestId}
                onRemoveSerial={onRemoveSerial}
                onToggleEscalation={onToggleEscalation}
              />
            ) : group.items.length > 0 ? (
              <div className="space-y-px">
                {group.items.map(scan => (
                  <GroupItemRow
                    key={scan.id}
                    scan={scan}
                    isNewest={scan.id === newestId}
                    onRemoveSerial={onRemoveSerial}
                    onToggleEscalation={onToggleEscalation}
                  />
                ))}
              </div>
            ) : (
              <div className="px-4 py-2 pl-10 text-xs text-air-blue/30 italic">
                Awaiting serials...
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function ScanLog({ scans, mode, currentTracking, onRemoveSerial, onRemoveTrackingGroup, onSelectTracking, onToggleEscalation }) {
  const showGroupToggle = mode === 'tracking_serial'
  const [view, setView] = useState('grouped')

  if (!scans.length) {
    return (
      <div className="text-center py-8 text-air-blue/50 text-sm">
        No scans yet. Start scanning to see entries here.
      </div>
    )
  }

  if (!showGroupToggle) {
    return (
      <VirtualFlatList
        scans={scans}
        onRemove={onRemoveSerial}
        onToggleEscalation={onToggleEscalation}
      />
    )
  }

  return (
    <div>
      <div className="flex gap-1 mb-3">
        <button
          onClick={() => setView('grouped')}
          className={`text-xs px-3 py-1 rounded-md transition ${
            view === 'grouped' ? 'bg-air-blue/20 text-air-blue' : 'text-air-blue/40 hover:text-air-blue/60'
          }`}
        >
          Grouped
        </button>
        <button
          onClick={() => setView('flat')}
          className={`text-xs px-3 py-1 rounded-md transition ${
            view === 'flat' ? 'bg-air-blue/20 text-air-blue' : 'text-air-blue/40 hover:text-air-blue/60'
          }`}
        >
          Flat
        </button>
      </div>

      <div className="max-h-[400px] overflow-y-auto pr-1">
        {view === 'grouped' ? (
          <GroupedView
            scans={scans}
            currentTracking={currentTracking}
            onRemoveSerial={onRemoveSerial}
            onRemoveTrackingGroup={onRemoveTrackingGroup}
            onSelectTracking={onSelectTracking}
            onToggleEscalation={onToggleEscalation}
          />
        ) : (
          <VirtualFlatList
            scans={scans}
            onRemove={onRemoveSerial}
            onToggleEscalation={onToggleEscalation}
          />
        )}
      </div>
    </div>
  )
}
