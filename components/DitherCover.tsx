"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Space_Grotesk } from "next/font/google";

const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"] });

// WebGL canvas — client-only, never server-rendered.
const Dither = dynamic(() => import("./Dither"), { ssr: false });

// Frosted-glass pill matching the React Bits banner: dark→light gradient,
// backdrop blur, hairline border, top sheen and a soft drop shadow.
const glassStyle: React.CSSProperties = {
  background:
    "linear-gradient(105deg, rgba(40,40,46,0.42) 0%, rgba(70,70,80,0.3) 58%, rgba(120,120,132,0.22) 100%)",
  backdropFilter: "blur(20px) saturate(1.25)",
  WebkitBackdropFilter: "blur(20px) saturate(1.25)",
  border: "1px solid rgba(255,255,255,0.18)",
  boxShadow:
    "0 12px 40px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.22)",
};

// keeps white text legible as the dither animates light/dark behind the glass
const textShadow = "0 1px 10px rgba(0,0,0,0.55)";

function Glass({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative inline-flex items-center overflow-hidden rounded-[26px] ${className}`}
      style={glassStyle}
    >
      {/* top glass sheen */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/12 to-transparent" />
      <span className="relative flex items-center gap-3">{children}</span>
    </div>
  );
}

function DbMark() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <ellipse cx="12" cy="6" rx="7.5" ry="3" />
      <path d="M4.5 6v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V6" />
      <path d="M4.5 12v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-6" />
    </svg>
  );
}

/**
 * Full-screen animated B&W dither cover shown at `/`. Every text sits in a
 * React-Bits-style frosted-glass pill. The Enter pill leads into the dashboard.
 */
export default function DitherCover() {
  return (
    <div className={`${display.className} fixed inset-0 overflow-hidden bg-white`}>
      {/* animated black & white dither (greyscale + invert = light field) */}
      <div className="absolute inset-0" style={{ filter: "invert(1)" }}>
        <Dither
          waveColor={[1, 1, 1]}
          waveSpeed={0.08}
          waveFrequency={2.6}
          waveAmplitude={0.35}
          colorNum={4}
          pixelSize={2}
          disableAnimation={false}
          enableMouseInteraction={true}
          mouseRadius={0.35}
        />
      </div>

      {/* top glass pills */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-4 px-6 pt-14 sm:pt-20">
        <Glass className="px-6 py-3.5">
          <DbMark />
          <span
            className="text-2xl font-bold tracking-tight text-white sm:text-4xl"
            style={{ textShadow }}
          >
            BlockchainDB
          </span>
        </Glass>

        <Glass className="px-5 py-2.5">
          <span
            className="text-sm font-medium text-white sm:text-base"
            style={{ textShadow }}
          >
            The blockchain is your database.
          </span>
        </Glass>

        <Link
          href="/dashboard"
          className="pointer-events-auto transition-transform hover:scale-105"
        >
          <Glass className="px-7 py-3">
            <span
              className="text-sm font-bold tracking-tight text-white sm:text-base"
              style={{ textShadow }}
            >
              Enter →
            </span>
          </Glass>
        </Link>
      </div>

      {/* signature */}
      <div className="absolute bottom-5 right-6">
        <Glass className="px-4 py-2">
          <span className="font-mono text-sm text-white" style={{ textShadow }}>
            0xrlawrence
          </span>
        </Glass>
      </div>
    </div>
  );
}
