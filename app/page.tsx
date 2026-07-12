import DitherCover from "@/components/DitherCover";

/**
 * Root route: a full-screen animated dither cover. The "Enter" button leads
 * into the dashboard (which is the app itself, at /dashboard).
 */
export default function Home() {
  return <DitherCover />;
}
