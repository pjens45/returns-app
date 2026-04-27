import { useState } from 'react'

const TUTORIAL_STEPS = [
  {
    title: 'How Check-In Works',
    body: (
      <>
        <p>This app is designed for a <strong className="text-white">fast check-in workflow</strong>:</p>
        <p className="mt-2">Log in → scan a <strong className="text-white">box tracking number</strong> → scan the <strong className="text-white">items inside</strong> → scan the next box → repeat.</p>
        <p className="mt-2">If you missed an item from an earlier box, you can scan that box's tracking number again to add more items to it.</p>
      </>
    ),
  },
  {
    title: 'Unpackage Product(s)',
    body: (
      <p>After scanning a box tracking number, Deako product(s) need to be <strong className="text-white">removed from their packaging</strong> before they can be scanned in.</p>
    ),
  },
  {
    title: 'Individual Check-In',
    body: (
      <>
        <p>Each product is checked in <strong className="text-white">individually</strong>.</p>
        <p className="mt-2">Switches need to be <strong className="text-white">removed from the connector (backplate)</strong> before scanning. Pull the <strong className="text-air-blue">blue release tab</strong> to unlock, then lift the switch out of the socket.</p>
      </>
    ),
  },
  {
    title: 'Scanning Products',
    body: (
      <>
        <p>Each product has a <strong className="text-white">sticker</strong> on it to scan. There are three types:</p>
        <div className="mt-3 space-y-3">
          <div className="px-3 py-2.5 rounded-lg bg-air-blue/10 border border-air-blue/30">
            <p className="text-white font-bold text-xs uppercase tracking-wider">QR Code Sticker</p>
            <p className="mt-1">Scan it and you're done — the app identifies the product automatically. <strong className="text-white">Most products have this.</strong></p>
          </div>
          <div className="px-3 py-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
            <p className="text-white font-bold text-xs uppercase tracking-wider">Barcode Sticker</p>
            <p className="mt-1">Scan it, then <strong className="text-white">tap a button in the app</strong> to select the product type. The product name is usually printed on the device.</p>
          </div>
          <div className="px-3 py-2.5 rounded-lg bg-terra/10 border border-terra/30">
            <p className="text-white font-bold text-xs uppercase tracking-wider">No Sticker on Product</p>
            <p className="mt-1">Scan the <strong className="text-white">barcode on the packaging</strong>, or tap <strong className="text-terra">❌ Can't Scan</strong> and pick the product from the list.</p>
          </div>
        </div>
      </>
    ),
  },
  {
    title: 'Need Help?',
    body: (
      <>
        <p>If you <strong className="text-white">can't identify a product</strong>, tap <strong className="text-terra">❌ Can't Scan</strong> → <strong className="text-yellow-400">Don't know what this product is?</strong> to log it for review and move on.</p>
        <p className="mt-3">Tap the <strong className="text-yellow-400">Help</strong> button anytime for:</p>
        <ul className="mt-1 space-y-1 text-sm">
          <li>• <strong className="text-white">Product / Shipment Problem</strong> — damaged item, wrong contents, can't identify something</li>
          <li>• <strong className="text-white">App Problem</strong> — something in the app isn't working right (Deako will be notified)</li>
        </ul>
      </>
    ),
  },
  {
    title: 'You\'re Ready!',
    body: (
      <p>Scan a <strong className="text-white">box tracking number</strong> to start, then scan each <strong className="text-white">item inside</strong>. When the box is done, scan the next tracking number.</p>
    ),
  },
]

export default function OnboardingTutorial({ onComplete }) {
  const [step, setStep] = useState(0)
  const current = TUTORIAL_STEPS[step]
  const isLast = step === TUTORIAL_STEPS.length - 1

  return (
    <div className="rounded-xl p-6 bg-air-blue/10 border-2 border-air-blue/40 space-y-4">
      {/* Progress dots */}
      <div className="flex justify-center gap-2">
        {TUTORIAL_STEPS.map((_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-all ${
              i === step ? 'bg-air-blue w-4' : i < step ? 'bg-air-blue/40' : 'bg-air-blue/20'
            }`}
          />
        ))}
      </div>

      {/* Step title */}
      <p className="text-sm font-bold text-air-blue uppercase tracking-wider text-center">
        {current.title}
      </p>

      {/* Step content */}
      <div className="text-sm text-beige/80 leading-relaxed">
        {current.body}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-1">
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="flex-1 py-2.5 rounded-lg border border-air-blue/20 text-air-blue text-sm font-medium hover:bg-air-blue/10 transition"
          >
            Back
          </button>
        )}
        {isLast ? (
          <button
            onClick={onComplete}
            className="flex-1 py-2.5 rounded-lg bg-air-blue text-white text-sm font-bold hover:bg-air-blue/80 transition"
          >
            Start Scanning
          </button>
        ) : (
          <button
            onClick={() => setStep(step + 1)}
            className="flex-1 py-2.5 rounded-lg bg-air-blue/20 border border-air-blue/30 text-air-blue text-sm font-bold hover:bg-air-blue/30 transition"
          >
            Next
          </button>
        )}
        {!isLast && (
          <button
            onClick={onComplete}
            className="py-2.5 px-4 rounded-lg text-air-blue/40 text-xs font-medium hover:text-air-blue/60 transition"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  )
}
