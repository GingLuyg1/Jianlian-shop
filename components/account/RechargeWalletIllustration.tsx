import { useId } from "react";

export default function RechargeWalletIllustration() {
  const id = `wallet-glass-${useId().replace(/:/g, "")}`;
  return <svg data-testid="recharge-wallet-illustration" viewBox="0 0 232 156" fill="none" aria-hidden="true" className="pointer-events-none absolute right-0 top-0 hidden h-[136px] w-52 overflow-visible sm:block">
    <defs>
      <radialGradient id={`${id}-halo`}><stop stopColor="#f0c596" stopOpacity="0.25" /><stop offset="1" stopColor="#f0c596" stopOpacity="0" /></radialGradient>
      <linearGradient id={`${id}-back`} x1="113" y1="22" x2="183" y2="96" gradientUnits="userSpaceOnUse"><stop stopColor="#fffefa" /><stop offset="0.5" stopColor="#fae9d4" /><stop offset="1" stopColor="#e8c39b" /></linearGradient>
      <linearGradient id={`${id}-middle`} x1="80" y1="38" x2="177" y2="117" gradientUnits="userSpaceOnUse"><stop stopColor="#fffdf9" /><stop offset="1" stopColor="#f2d5b3" /></linearGradient>
      <linearGradient id={`${id}-face`} x1="83" y1="48" x2="164" y2="124" gradientUnits="userSpaceOnUse"><stop stopColor="#fffefa" /><stop offset="0.48" stopColor="#fff4e4" /><stop offset="1" stopColor="#edcca5" /></linearGradient>
      <linearGradient id={`${id}-edge`} x1="69" y1="44" x2="191" y2="126" gradientUnits="userSpaceOnUse"><stop stopColor="#fff3df" /><stop offset="0.45" stopColor="#e0bb94" /><stop offset="1" stopColor="#c99b70" /></linearGradient>
      <linearGradient id={`${id}-metal`} x1="81" y1="71" x2="98" y2="85" gradientUnits="userSpaceOnUse"><stop stopColor="#e9d2a6" /><stop offset="0.45" stopColor="#fff4cf" /><stop offset="1" stopColor="#c9aa70" /></linearGradient>
      <linearGradient id={`${id}-clasp`} x1="164" y1="77" x2="181" y2="101" gradientUnits="userSpaceOnUse"><stop stopColor="#fffefb" /><stop offset="1" stopColor="#f1dabe" /></linearGradient>
      <linearGradient id={`${id}-coin`} x1="172" y1="100" x2="190" y2="132" gradientUnits="userSpaceOnUse"><stop stopColor="#fff5df" /><stop offset="0.55" stopColor="#edc594" /><stop offset="1" stopColor="#c9955f" /></linearGradient>
      <filter id={`${id}-ground`} x="-30%" y="-100%" width="160%" height="300%"><feGaussianBlur stdDeviation="3" /></filter>
      <filter id={`${id}-back-shadow`} x="-25%" y="-25%" width="150%" height="160%"><feDropShadow dy="3" stdDeviation="2" floodColor="#926132" floodOpacity="0.13" /></filter>
      <filter id={`${id}-shadow`} x="-25%" y="-35%" width="155%" height="180%"><feDropShadow dy="7" stdDeviation="5" floodColor="#a0774c" floodOpacity="0.13" /><feDropShadow dy="1" stdDeviation="0.8" floodColor="#aa7443" floodOpacity="0.11" /></filter>
    </defs>
    <ellipse cx="144" cy="82" rx="96" ry="62" fill={`url(#${id}-halo)`} />
    <ellipse cx="141" cy="132" rx="57" ry="4.5" fill="#ac8051" opacity="0.12" filter={`url(#${id}-ground)`} />
    <path d="M42 102C68 127 170 135 212 96" stroke="#e8bc96" strokeOpacity="0.35" strokeWidth="0.8" strokeLinecap="round" />
    <g filter={`url(#${id}-back-shadow)`} transform="rotate(9 145 58)">
      <rect x="95" y="24" width="103" height="69" rx="11" fill="#d6b28c" opacity="0.35" />
      <rect x="95" y="22" width="103" height="69" rx="11" fill={`url(#${id}-back)`} stroke="#d6b18a" strokeWidth="1.05" />
      <rect x="96" y="23" width="101" height="67" rx="10" stroke="white" strokeOpacity="0.65" />
      <path d="M96 39H197" stroke="#d8b38b" strokeWidth="5" strokeOpacity="0.65" />
      <path d="M108 71H133" stroke="#c09a71" strokeWidth="1.7" strokeLinecap="round" />
    </g>
    <g transform="rotate(-13 132 81)"><rect x="77" y="39" width="112" height="72" rx="11" fill={`url(#${id}-middle)`} stroke="#e4c39e" strokeWidth="1" /><path d="M87 45H171" stroke="white" strokeOpacity="0.85" strokeLinecap="round" /></g>
    <g filter={`url(#${id}-shadow)`} transform="rotate(-6 126 88)">
      <rect x="67" y="51" width="123" height="73" rx="13" fill="#c79c71" opacity="0.42" />
      <rect x="67" y="48" width="123" height="73" rx="13" fill={`url(#${id}-face)`} stroke={`url(#${id}-edge)`} strokeWidth="1.35" />
      <rect x="68.2" y="49.2" width="120.6" height="70.6" rx="12" stroke="white" strokeOpacity="0.58" strokeWidth="0.8" />
      <path d="M80 50H177C182 50 187 54 188 59C157 68 107 78 69 79V61C69 55 74 50 80 50Z" fill="white" fillOpacity="0.36" />
      <path d="M79 59H154" stroke="white" strokeWidth="1.5" strokeOpacity="0.95" strokeLinecap="round" />
      <path d="M80 117H177" stroke="#c99e71" strokeOpacity="0.34" strokeWidth="0.8" strokeLinecap="round" />
      <rect x="81" y="71" width="17" height="14" rx="3.5" fill={`url(#${id}-metal)`} stroke="#c4a26c" strokeWidth="0.8" /><path d="M87 72V84M82 78H97" stroke="#bda575" strokeWidth="0.7" />
      <path d="M81 101H107M81 106H97" stroke="#b88f66" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M164 79H191V101H164C158 101 154 97 154 90S158 79 164 79Z" fill="#b99570" fillOpacity="0.2" />
      <path d="M164 77H191V99H164C158 99 154 95 154 88S158 77 164 77Z" fill={`url(#${id}-clasp)`} stroke="#ccaa84" strokeWidth="1.05" />
      <path d="M164 78.5H189" stroke="white" strokeOpacity="0.85" strokeLinecap="round" />
      <circle cx="166" cy="88" r="2.7" fill="#c19462" /><circle cx="165.4" cy="87.3" r="1" fill="#fff4dc" fillOpacity="0.9" />
    </g>
    <g filter={`url(#${id}-back-shadow)`}>
      <circle cx="182" cy="117" r="15" fill="#c29b6e" />
      <circle cx="182" cy="115" r="15" fill={`url(#${id}-coin)`} stroke="#caa273" strokeWidth="0.9" />
      <circle cx="182" cy="115" r="12" fill="#fff6e6" stroke="#fffcf5" strokeWidth="1.1" />
      <path d="M171 108C175 100 187 100 193 108" stroke="white" strokeOpacity="0.85" strokeLinecap="round" />
      <path d="M177 108L182 114L187 108M177 114H187M177 118H187M182 114V123" stroke="#b17e48" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  </svg>;
}
