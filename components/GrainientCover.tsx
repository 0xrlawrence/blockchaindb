"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Space_Grotesk, Stalinist_One } from "next/font/google";

const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"] });
const brand = Stalinist_One({ subsets: ["latin"], weight: ["400"] });

// WebGL canvas — client-only, never server-rendered.
const Grainient = dynamic(() => import("./Grainient"), { ssr: false });

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

// keeps white text legible as the grainient shifts light/dark behind it
const textShadow = "0 1px 10px rgba(0,0,0,0.55)";
// stronger outline for text sitting directly on the grainient (no glass pill)
const strongShadow =
  "0 0 3px rgba(0,0,0,0.95), 0 0 3px rgba(0,0,0,0.95), 0 3px 18px rgba(0,0,0,0.8)";

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

/**
 * Full-screen animated monochrome grainient cover shown at `/`. Every text
 * sits in a React-Bits-style frosted-glass pill. The Enter pill leads into
 * the dashboard.
 */
export default function GrainientCover() {
  return (
    <div className={`${display.className} fixed inset-0 overflow-hidden bg-white`}>
      {/* animated monochrome grainient — bryl-minimal gray ramp */}
      <div className="absolute inset-0">
        <Grainient
          color1="#ececec"
          color2="#434346"
          color3="#959595"
          timeSpeed={1.5}
          colorBalance={0.0}
          warpStrength={1.4}
          warpFrequency={5.0}
          warpSpeed={2.0}
          warpAmplitude={50.0}
          blendAngle={0.0}
          blendSoftness={0.05}
          rotationAmount={500.0}
          noiseScale={2.0}
          grainAmount={0.15}
          grainScale={7.9}
          grainAnimated
          contrast={1.5}
          gamma={1.0}
          saturation={1.0}
          centerX={0.0}
          centerY={0.0}
          zoom={0.9}
        />
      </div>

      {/* top glass pills */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/starboar.webp"
          alt="StarBoarDB"
          className="h-24 w-24 sm:h-32 sm:w-32"
          style={{ filter: "drop-shadow(0 0 10px rgba(255,255,255,0.5))" }}
        />
        <span
          className={`${brand.className} text-2xl tracking-tight !text-white sm:text-4xl`}
          style={{ textShadow: strongShadow }}
        >
          StarBoarDB
        </span>

        <span
          className="text-sm font-medium !text-white sm:text-[1.1rem]"
          style={{ textShadow: strongShadow }}
        >
          The blockchain is your database.
        </span>

        <Link
          href="/dashboard"
          className="pointer-events-auto transition-transform hover:scale-105"
        >
          <Glass className="px-7 py-3">
            <span
              className="text-sm font-bold tracking-tight !text-white sm:text-[1rem]"
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
