export default function DuplicateModal({ serial, onDismiss }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="glass-solid rounded-2xl p-8 max-w-md w-full mx-4 space-y-6">
        <div className="text-center">
          <div className="text-terra text-4xl mb-3">&#9888;</div>
          <h2 className="text-xl font-bold text-white">Duplicate Serial</h2>
          <p className="text-air-blue mt-2 font-mono text-lg">{serial}</p>
          <p className="text-beige mt-3 text-sm">
            This serial number was already scanned in this session. Do not scan the same device twice.
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="w-full px-4 py-3 rounded-lg bg-air-blue/20 text-air-blue border border-air-blue/30 hover:bg-air-blue/30 transition font-medium"
        >
          OK
        </button>
      </div>
    </div>
  )
}
