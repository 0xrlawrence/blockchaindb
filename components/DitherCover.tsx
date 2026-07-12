"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

// WebGL canvas — client-only, never server-rendered.
const Dither = dynamic(() => import("./Dither"), { ssr: false });

/**
 * Full-screen animated dither cover shown at `/`. The "Enter" button in the
 * centre leads into the dashboard; the instance is signed "0xrlawrence"
 * bottom-right.
 */
export default function DitherCover() {
  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {/* animated dither background */}
      <div className="absolute inset-0">
        <Dither
          waveColor={[0.55, 0.5, 0.95]}
          waveSpeed={0.04}
          waveFrequency={2.6}
          waveAmplitude={0.35}
          colorNum={4}
          pixelSize={2}
          enableMouseInteraction={true}
          mouseRadius={0.35}
        />
      </div>

      {/* centre content — pointer-events pass through to the canvas except on the button */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 text-center">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.8)] sm:text-6xl">
            BlockchainDB
          </h1>
          <p className="mt-3 text-sm text-white/70 drop-shadow-[0_1px_10px_rgba(0,0,0,0.9)] sm:text-base">
            The blockchain is your database.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="pointer-events-auto rounded-full bg-brand px-8 py-3 text-sm font-semibold text-black shadow-[0_8px_30px_rgba(62,207,142,0.35)] transition-transform hover:scale-105 sm:text-base"
        >
          Enter →
        </Link>
      </div>

      {/* signature */}
      <div className="pointer-events-none absolute bottom-5 right-6 font-mono text-sm text-white/85 drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)]">
        0xrlawrence
      </div>
    </div>
  );
}
