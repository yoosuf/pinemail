import { useEffect } from "react";
import { useInboxStore } from "./store";

export function useRouterSync() {
  const activeTab = useInboxStore((s) => s.activeTab);
  const emailSelectedId = useInboxStore((s) => s.selectedId);
  const smsSelectedId = useInboxStore((s) => s.smsSelectedId);
  const setupOpen = useInboxStore((s) => s.setupOpen);
  const setupSegment = useInboxStore((s) => s.setupSegment);

  // Initial mount & hashchange (Browser Back/Forward) listener
  useEffect(() => {
    const handleHashChange = () => {
      const rawHash = window.location.hash.replace(/^#\/?/, "");
      if (!rawHash) return;

      const parts = rawHash.split("/").filter(Boolean);
      const first = parts[0]?.toLowerCase();

      if (first === "setup") {
        const seg = parts[1]?.toLowerCase();
        useInboxStore.setState({
          setupOpen: true,
          setupSegment: seg === "sms" ? "sms" : "email",
        });
        return;
      }

      if (first === "sms") {
        const id = parts[1] ? decodeURIComponent(parts[1]) : null;
        const currentStore = useInboxStore.getState();
        if (currentStore.activeTab !== "sms") {
          currentStore.setActiveTab("sms");
        }
        if (currentStore.sms.selectedId !== id) {
          currentStore.setCategorySelectedId("sms", id);
        }
        return;
      }

      if (first === "emails" || first === "email") {
        const id = parts[1] ? decodeURIComponent(parts[1]) : null;
        const currentStore = useInboxStore.getState();
        if (currentStore.activeTab !== "emails") {
          currentStore.setActiveTab("emails");
        }
        if (currentStore.emails.selectedId !== id) {
          currentStore.setCategorySelectedId("emails", id);
        }
        return;
      }
    };

    // Run on initial mount
    handleHashChange();

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // Sync Store State -> URL Hash
  useEffect(() => {
    let targetHash = "";

    if (setupOpen) {
      targetHash = `#/setup/${setupSegment}`;
    } else if (activeTab === "sms") {
      targetHash = smsSelectedId ? `#/sms/${encodeURIComponent(smsSelectedId)}` : "#/sms";
    } else {
      targetHash = emailSelectedId ? `#/emails/${encodeURIComponent(emailSelectedId)}` : "#/emails";
    }

    if (window.location.hash !== targetHash) {
      window.history.replaceState(null, "", targetHash);
    }
  }, [activeTab, emailSelectedId, smsSelectedId, setupOpen, setupSegment]);
}
