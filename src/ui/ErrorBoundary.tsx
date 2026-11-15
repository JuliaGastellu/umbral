import { Component, type ReactNode } from "react";

/**
 * Keeps one failing section (for example a map that receives unexpected data) from
 * blanking the whole page. The rest of the plan keeps working and the reason is shown.
 */
export class SectionBoundary extends Component<{ name: string; children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  componentDidCatch(e: unknown) {
    console.error(`[Umbral] ${this.props.name} failed:`, e);
  }
  render() {
    if (this.state.error)
      return (
        <div className="banner warn" role="alert">
          <p><strong>The {this.props.name} could not be shown.</strong> The rest of the plan keeps working. Reloading the page usually fixes it (Ctrl+Shift+R clears an old copy kept by the browser).</p>
        </div>
      );
    return this.props.children;
  }
}
