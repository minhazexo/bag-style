/**
 * Storefront funnel analytics.
 *
 * posthog-js is imported on the first event and only when VITE_POSTHOG_KEY is set, so an
 * unconfigured build ships no analytics code at all. Events captured before the SDK
 * resolves are queued and sent in order.
 *
 * Configuration: PostHog project key (VITE_POSTHOG_KEY) and host
 * (VITE_POSTHOG_HOST, defaulting to the US cloud). The key is a public client key.
 */

const key = (import.meta.env.VITE_POSTHOG_KEY || "").trim();
const host = (import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com").trim();

type PostHogClient = (typeof import("posthog-js/dist/module.slim.no-external"))["default"];
type Props = Record<string, unknown>;

export type FunnelEvent =
  | "product_view"
  | "category_filter"
  | "search"
  | "add_to_bag"
  | "checkout_submitted"
  | "whatsapp_click";

let client: PostHogClient | null = null;
let loading = false;
const pending: Array<[string, Props | undefined]> = [];

/** Never throws: analytics must never break the storefront. */
function capture(event: string, props?: Props) {
  if (!key) return;
  if (client) {
    client.capture(event, props);
    return;
  }
  pending.push([event, props]);
  if (loading) return;
  loading = true;
  void import("posthog-js/dist/module.slim.no-external")
    .then(({ default: posthog }) => {
      posthog.init(key, {
        api_host: host,
        persistence: "localStorage",
        autocapture: false,
        capture_pageview: false,
        disable_session_recording: true,
        person_profiles: "identified_only"
      });
      client = posthog;
      for (const [queued, queuedProps] of pending.splice(0)) posthog.capture(queued, queuedProps);
    })
    .catch(() => {
      pending.length = 0;
      loading = false;
    });
}

export function track(event: FunnelEvent, props?: Props) {
  capture(event, props);
}

/** Route views for the SPA, so funnels can be split by home, /p/<slug> and /c/<slug>. */
export function trackPageview(path: string) {
  capture("$pageview", { $current_url: window.location.origin + path });
}
