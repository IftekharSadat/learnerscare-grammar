/** Opt-in analytics interface stub. Nothing is sent anywhere by default; no third-party calls exist in this app. */
export interface AnalyticsSink {
  track(event: string, props?: Record<string, string | number | boolean>): void;
}
let sink: AnalyticsSink | null = null;
/** Call only after explicit user consent. */
export function setAnalyticsSink(s: AnalyticsSink | null) {
  sink = s;
}
export function track(event: string, props?: Record<string, string | number | boolean>) {
  sink?.track(event, props);
}
