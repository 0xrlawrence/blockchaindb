"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Space_Grotesk } from "next/font/google";

const display = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"] });

// WebGL canvas — client-only, never server-rendered.
const Dither = dynamic(() => import("./Dither"), { ssr: false });

/**
 * Full-screen animated dither cover shown at `/`. Light-mode, black & white,
 * auto-animating: the dither is rendered greyscale and CSS-inverted so it reads
 * as black dots on a light field. Title + "Enter" sit at the top; the Enter
 * button leads into the dashboard. Signed "0xrlawrence" bottom-right.
 */
export default function DitherCover() {
  return (
    <div className={`${display.className} fixed inset-0 overflow-hidden bg-white`}>
      {/* animated black & white dither background (greyscale + invert = light mode) */}
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

      {/* top content — dark text for the light background */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-5 px-6 pt-14 text-center sm:pt-20">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-black drop-shadow-[0_1px_16px_rgba(255,255,255,0.9)] sm:text-6xl">
            BlockchainDB
          </h1>
          <p className="mt-2 text-sm font-medium text-black/70 drop-shadow-[0_1px_10px_rgba(255,255,255,0.95)] sm:text-base">
            The blockchain is your database.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="pointer-events-auto rounded-full bg-black px-8 py-3 text-sm font-bold tracking-tight text-white shadow-[0_8px_30px_rgba(0,0,0,0.35)] transition-transform hover:scale-105 sm:text-base"
        >
          Enter →
        </Link>
      </div>

      {/* signature */}
      <div className="pointer-events-none absolute bottom-5 right-6 font-mono text-sm text-black/80 drop-shadow-[0_1px_8px_rgba(255,255,255,0.9)]">
        0xrlawrence
      </div>
    </div>
  );
}
