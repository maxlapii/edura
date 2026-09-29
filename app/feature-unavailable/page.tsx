import { notFound } from "next/navigation";

/** Target of proxy.ts rewrites for switched-off features: renders the standard 404 page. */
export default function FeatureDisabled() {
  notFound();
}
