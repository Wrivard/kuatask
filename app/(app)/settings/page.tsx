import { Header } from "@/components/shell/header";
import { SettingsTabs } from "@/components/shell/settings-tabs";
import { ProfileClient } from "./profile-client";
import { copy } from "@/lib/copy";

export default function SettingsPage() {
  return (
    <>
      <Header title={copy.nav.settings} />
      <SettingsTabs />
      <ProfileClient />
    </>
  );
}
