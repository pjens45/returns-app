import { getProductType } from '../utils/helpers'

export default function SessionSummary({ scans, session, onClose }) {
  const active = scans.filter(s => !s.voidedAt)
  const boxes = active.filter(s => s.scanType === 'Tracking').length
  const devices = active.filter(s => s.scanType !== 'Tracking').length
  const escalated = active.filter(s => s.status === 'Escalated')

  // Product breakdown (serials + lots + manual)
  const productCounts = {}
  active.filter(s => s.scanType !== 'Tracking').forEach(s => {
    const pt = s.productType || getProductType(s.value)
    productCounts[pt] = (productCounts[pt] || 0) + 1
  })

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="glass-solid rounded-2xl p-8 max-w-lg w-full mx-4 space-y-6 max-h-[90vh] overflow-y-auto">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white">Session Complete</h2>
        </div>

        {escalated.length > 0 && (
          <div className="px-4 py-3 rounded-lg bg-terra/20 border-2 border-terra text-terra text-center font-semibold">
            &#9888; {escalated.length} issue{escalated.length !== 1 ? 's' : ''} reported
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="px-4 py-5 rounded-xl glass stat-accent-moss text-center">
            <div className="text-4xl font-black text-white">{boxes}</div>
            <div className="text-xs text-moss font-medium mt-1 uppercase tracking-wider">
              Box{boxes !== 1 ? 'es' : ''} Scanned
            </div>
          </div>
          <div className="px-4 py-5 rounded-xl glass stat-accent-blue text-center">
            <div className="text-4xl font-black text-white">{devices}</div>
            <div className="text-xs text-air-blue font-medium mt-1 uppercase tracking-wider">
              Device{devices !== 1 ? 's' : ''} Checked In
            </div>
          </div>
        </div>

        {Object.keys(productCounts).length > 0 && (
          <div>
            <h3 className="text-xs font-bold text-air-blue uppercase tracking-wider mb-2">Product Breakdown</h3>
            <div className="space-y-1">
              {Object.entries(productCounts).sort((a, b) => b[1] - a[1]).map(([product, count]) => (
                <div key={product} className="flex justify-between text-sm px-3 py-2 rounded bg-deako-black/30">
                  <span className="text-beige">{product}</span>
                  <span className="text-white font-mono font-bold">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-4 rounded-xl bg-air-blue text-white font-bold text-lg hover:bg-air-blue/80 transition"
        >
          Done
        </button>
      </div>
    </div>
  )
}
