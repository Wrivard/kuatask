import { Header } from "@/components/shell/header";
import { SettingsTabs } from "@/components/shell/settings-tabs";
import { ProfileClient } from "./profile-client";
import { BuildStamp } from "@/components/shell/build-stamp";
import { copy } from "@/lib/copy";

export default function SettingsPage() {
  return (
    <>
      <Header title={copy.nav.settings} />
      <SettingsTabs />
      <ProfileClient />

      {/*
        Which build this is. Added after half an hour went into establishing
        that a deploy had gone out at all — the code was live, the person was
        looking at the login screen, and nothing inside the app could tell those
        two situations apart.
      */}
      <div className="max-w-[560px] px-6 pb-8">
        <h2 className="mb-1 text-[13px] font-medium text-fg-muted">
          {copy.settings.version}
        </h2>
        <BuildStamp />
      </div>
    </>
  );
}
