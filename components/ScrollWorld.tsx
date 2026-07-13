"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    mountScrollWorld?: (container: HTMLElement, config: unknown) => void;
  }
}

const A = "/scroll-world/assets";

/**
 * Crypto landing page built on the scroll-world scrub engine
 * (https://github.com/0xrlawrence/scroll-world): one continuous camera
 * flight through an isometric crypto world, scrubbed by scroll position.
 * Legs were rendered as a single flight and cut at frame boundaries, so
 * every seam is frame-identical (architecture A — connectors: []).
 */
const CONFIG = {
  brand: { name: "StarBoarDB", href: "#top" },
  cta: { label: "Launch App", href: "/dashboard" },
  hint: "scroll to fly in",
  diveScroll: 1.35,
  connScroll: 0.9,
  crossfade: 0.08,
  sections: [
    {
      id: "chain",
      label: "The Chain",
      still: `${A}/chain.webp`,
      clip: `${A}/vid/chain.mp4`,
      accent: "#22d3ee",
      scroll: 1.6,
      linger: 0.45,
      eyebrow: "Every record, on-chain",
      title: "The blockchain is your database.",
      body: "Every document you write becomes a transaction — sealed into a block, hashed to the one before it, and replicated across the network. Immutable by physics, not by policy.",
      tags: ["Immutable", "Verifiable", "Yours"],
    },
    {
      id: "consensus",
      label: "Consensus",
      still: `${A}/consensus.webp`,
      clip: `${A}/vid/consensus.mp4`,
      accent: "#34d399",
      eyebrow: "Proof, not promises",
      title: "Secured by the whole network.",
      body: "Validators around the world agree on every byte before it exists. No admin can edit a row, no outage can lose one — consensus is the backup strategy.",
      tags: ["Proof of Stake", "EVM", "Polygon Amoy"],
    },
    {
      id: "contracts",
      label: "Smart Contracts",
      still: `${A}/contracts.webp`,
      clip: `${A}/vid/contracts.mp4`,
      accent: "#8b5cf6",
      eyebrow: "Code is law",
      title: "One contract. Five functions.",
      body: "Database.sol speaks create, get, update, delete and list — collections of JSON documents with auto-incrementing IDs, in a few hundred lines of Solidity.",
      tags: ["Solidity", "create()", "list()"],
    },
    {
      id: "vault",
      label: "The Vault",
      still: `${A}/vault.webp`,
      clip: `${A}/vid/vault.mp4`,
      accent: "#f59e0b",
      eyebrow: "Your keys, your data",
      title: "Own every byte you write.",
      body: "A single wallet signs every write. No accounts, no vendor lock-in, no one to ask permission — just your private key and the chain.",
      tags: ["Self-custody", "ethers.js v6"],
    },
    {
      id: "studio",
      label: "The Studio",
      still: `${A}/studio.webp`,
      clip: `${A}/vid/studio.mp4`,
      accent: "#3ecf8e",
      scroll: 1.7,
      linger: 0.5,
      eyebrow: "And it all flows into",
      title: "A Supabase-style studio for the chain.",
      body: "Clone the repo, deploy one contract, open localhost:3000. Collections, JSON editors and CRUD APIs on any EVM network — no Solidity knowledge required.",
      tags: [],
      cta: {
        primary: { label: "Launch Dashboard", href: "/dashboard" },
        secondary: { label: "Read the tutorial", href: "/dashboard" },
      },
    },
  ],
  // Architecture A: the legs are one continuous flight cut at frame
  // boundaries, so no connector clips are needed — seams crossfade directly.
  connectors: [],
};

export default function ScrollWorld() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || container.dataset.mounted) return;

    const mount = () => {
      if (!container.dataset.mounted && window.mountScrollWorld) {
        container.dataset.mounted = "true";
        window.mountScrollWorld(container, CONFIG);
      }
    };

    if (window.mountScrollWorld) {
      mount();
    } else {
      const script = document.createElement("script");
      script.src = "/scroll-world/scrub-engine.js";
      script.onload = mount;
      document.body.appendChild(script);
    }

    return () => {
      // The engine builds its DOM inside the container; clearing it lets a
      // remount (dev strict mode, client nav back to "/") start clean.
      container.innerHTML = "";
      container.classList.remove("sw-root");
      delete container.dataset.mounted;
    };
  }, []);

  return <div id="top" ref={containerRef} />;
}
