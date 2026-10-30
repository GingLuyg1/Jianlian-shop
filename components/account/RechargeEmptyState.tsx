import { useId, type ReactNode } from "react";

export default function RechargeEmptyState({ title, variant = "recharge", actions }: { title: string; variant?: "recharge" | "balance"; actions?: ReactNode }) {
  const gradientId = `empty-paper-${useId().replace(/:/g, "")}`;
  return <div data-testid="record-empty-state" className="mt-4 flex min-h-[300px] flex-1 flex-col items-center justify-center rounded-2xl border border-[#f0e7dd] bg-[radial-gradient(ellipse_at_top,#fff6eb_0%,#fdfbf8_65%)] px-5 py-10 text-center">
    <div data-empty-illustration={variant} aria-hidden="true" className="mb-5 h-32 w-40 shrink-0 sm:h-36 sm:w-44">
      <svg viewBox="0 0 200 160" fill="none" className="h-full w-full">
        <defs>
          <radialGradient id={`${gradientId}-halo`}><stop stopColor="#edcfab" stopOpacity="0.3" /><stop offset="1" stopColor="#edcfab" stopOpacity="0" /></radialGradient>
          <linearGradient id={`${gradientId}-back`} x1="81" y1="18" x2="150" y2="101" gradientUnits="userSpaceOnUse"><stop stopColor="#fffdf7" /><stop offset="0.55" stopColor="#f7e7d0" /><stop offset="1" stopColor="#dfbb8d" /></linearGradient>
          <linearGradient id={`${gradientId}-middle`} x1="42" y1="36" x2="150" y2="119" gradientUnits="userSpaceOnUse"><stop stopColor="#fffcf5" /><stop offset="1" stopColor="#efd4af" /></linearGradient>
          <linearGradient id={gradientId} x1="49" y1="46" x2="150" y2="135" gradientUnits="userSpaceOnUse"><stop stopColor="#fffefa" /><stop offset="0.5" stopColor="#fff9ee" /><stop offset="1" stopColor="#f0dbbc" /></linearGradient>
          <linearGradient id={`${gradientId}-edge`} x1="35" y1="42" x2="164" y2="130" gradientUnits="userSpaceOnUse"><stop stopColor="#ecd2b1" /><stop offset="0.4" stopColor="#fff4df" /><stop offset="1" stopColor="#bc9465" /></linearGradient>
          <linearGradient id={`${gradientId}-metal`} x1="48" y1="57" x2="66" y2="74" gradientUnits="userSpaceOnUse"><stop stopColor="#d6b57c" /><stop offset="0.45" stopColor="#fff1cb" /><stop offset="1" stopColor="#b8945d" /></linearGradient>
          <linearGradient id={`${gradientId}-coin`} x1="147" y1="104" x2="170" y2="145" gradientUnits="userSpaceOnUse"><stop stopColor="#fff5df" /><stop offset="0.5" stopColor="#eccb9d" /><stop offset="1" stopColor="#ba8a54" /></linearGradient>
          <filter id={`${gradientId}-ground`} x="-40%" y="-200%" width="180%" height="500%"><feGaussianBlur stdDeviation="3" /></filter>
          <filter id={`${gradientId}-back-shadow`} x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dy="3" stdDeviation="2" floodColor="#986d3d" floodOpacity="0.14" /></filter>
          <filter id={`${gradientId}-shadow`} x="-30%" y="-35%" width="170%" height="190%"><feDropShadow dy="8" stdDeviation="5" floodColor="#91683d" floodOpacity="0.15" /><feDropShadow dy="1" stdDeviation="0.7" floodColor="#a77c4b" floodOpacity="0.15" /></filter>
        </defs>
        <ellipse cx="102" cy="82" rx="86" ry="66" fill={`url(#${gradientId}-halo)`} />
        <ellipse cx="103" cy="141" rx="58" ry="4" fill="#a7835a" fillOpacity="0.17" filter={`url(#${gradientId}-ground)`} />
        <path d="M15 106C36 132 141 146 184 107" stroke="#ddbc94" strokeOpacity="0.38" strokeWidth="0.8" strokeLinecap="round" />
        {/* Separate paper, sleeve and glass face give the same material depth as the wallet header. */}
        <g transform="rotate(9 116 65)" filter={`url(#${gradientId}-back-shadow)`}>
          <rect x="69" y="18" width="94" height="95" rx="11" fill="#c5a174" fillOpacity="0.3" />
          <rect x="69" y="16" width="94" height="95" rx="11" fill={`url(#${gradientId}-back)`} stroke="#d2b48e" />
          <rect x="70.3" y="17.3" width="91.4" height="92.4" rx="10" stroke="white" strokeOpacity="0.75" />
          <path d="M82 32H150M82 39H130" stroke="#c5a579" strokeWidth="1.6" strokeLinecap="round" strokeOpacity="0.7" />
        </g>
        <g transform="rotate(-10 98 87)"><rect x="37" y="35" width="119" height="88" rx="12" fill={`url(#${gradientId}-middle)`} stroke="#ddc19c" /><path d="M50 39H142" stroke="white" strokeWidth="1.2" strokeLinecap="round" /></g>
        <g transform="rotate(-4 97 90)" filter={`url(#${gradientId}-shadow)`}>
          <rect x="31" y="48" width="132" height="86" rx="13" fill="#ba9368" fillOpacity="0.35" />
          <rect x="31" y="45" width="132" height="86" rx="13" fill={`url(#${gradientId})`} stroke={`url(#${gradientId}-edge)`} strokeWidth="1.3" />
          <rect x="32.4" y="46.4" width="129.2" height="83.2" rx="12" stroke="white" strokeOpacity="0.65" strokeWidth="0.8" />
          <path d="M44 47H149C155 47 160 52 161 58C127 70 77 80 33 80V58C33 52 38 47 44 47Z" fill="white" fillOpacity="0.45" />
          <path d="M46 53H131" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          <rect x="47" y="59" width="17" height="14" rx="3.5" fill={`url(#${gradientId}-metal)`} stroke="#c4a573" strokeWidth="0.8" />
          <path d="M53 60V72M48 66H63" stroke="#b49a6c" strokeWidth="0.7" />
          <path d="M77 63H114M77 69H101" stroke="#c2a17a" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M46 82H147" stroke="#e3ccaf" strokeOpacity="0.75" strokeWidth="0.8" />
          {[94, 106, 118].map((y, index) => <g key={y}>
            <rect x="47" y={y - 2} width="4" height="4" rx="1" stroke="#c7ab86" strokeWidth="0.8" />
            <path d={`M59 ${y}H${index === 2 ? 86 : 101}`} stroke="#bda180" strokeWidth="1.3" strokeLinecap="round" />
            <path d={`M122 ${y}H145`} stroke="#d1b795" strokeWidth="1.3" strokeLinecap="round" />
          </g>)}
          <path d="M46 127H145" stroke="#bda17e" strokeOpacity="0.3" strokeWidth="0.8" strokeLinecap="round" />
        </g>
        <g filter={`url(#${gradientId}-back-shadow)`}>
          <circle cx="158" cy="126" r="19" fill="#b69160" />
          <circle cx="158" cy="124" r="19" fill={`url(#${gradientId}-coin)`} stroke="#c49f70" strokeWidth="0.9" />
          <circle cx="158" cy="124" r="15.5" fill="#fff8eb" stroke="#fffdf4" strokeWidth="1.2" />
          <path d="M143 114C150 105 164 105 173 114" stroke="white" strokeOpacity="0.8" strokeLinecap="round" />
          {variant === "balance" ? <path d="M150 119H164M160 115L164 119L160 123M166 129H152M156 125L152 129L156 133" stroke="#ac7a45" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /> : <g stroke="#ac7a45" strokeWidth="1.4" strokeLinecap="round"><circle cx="158" cy="124" r="7.5" /><path d="M158 119V124L162 126" /></g>}
        </g>
      </svg>
    </div>
    <h3 className="text-[15px] font-semibold tracking-tight text-[#79695a]">{title}</h3>
    {actions ? <div className="mt-5">{actions}</div> : null}
  </div>;
}
