import React from "react";
import { VncDisplay } from "@/components/vnc-display";
import { AudioPlayer } from "@/components/audio-player";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VmControls } from "@/components/panels/vm-controls";
import { SettingsPanel } from "@/components/panels/settings-panel";
import { KeyboardPanel } from "@/components/panels/keyboard-panel";
import { SnapshotsPanel } from "@/components/panels/snapshots-panel";
import { TwitchPanel } from "@/components/panels/twitch-panel";
import { Terminal } from "lucide-react";

export default function Home() {
  return (
    <div className="h-[100dvh] w-full flex flex-col bg-background scanlines overflow-hidden">
      {/* Header */}
      <header className="h-12 shrink-0 border-b border-primary/20 flex items-center justify-between px-3 bg-black/60 relative z-10">
        <div className="flex items-center gap-2 min-w-0">
          <Terminal className="w-4 h-4 text-primary shrink-0" />
          <h1 className="font-mono font-bold tracking-widest text-primary text-glow uppercase text-xs sm:text-sm truncate">
            QEMU Control Terminal
          </h1>
        </div>
        <div className="shrink-0 ml-2">
          <AudioPlayer />
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0 relative z-10">

        {/* VNC Area */}
        <div className="shrink-0 lg:flex-1 h-[38vh] sm:h-[42vh] lg:h-auto lg:min-h-0 p-2 lg:p-3">
          <div className="w-full h-full border border-primary/30 bg-black relative overflow-hidden">
            <VncDisplay />
          </div>
        </div>

        {/* Control Panels */}
        <div className="flex-1 lg:flex-none lg:w-[340px] xl:w-[380px] min-h-0 border-t lg:border-t-0 lg:border-l border-primary/20 flex flex-col bg-black/20">
          <Tabs defaultValue="controls" className="flex flex-col h-full min-h-0">
            <TabsList className="shrink-0 w-full justify-start rounded-none border-b border-primary/20 bg-black/60 h-11 p-0 overflow-x-auto overflow-y-hidden">
              <TabsTrigger
                value="controls"
                className="rounded-none data-[state=active]:bg-primary data-[state=active]:text-black border-r border-primary/20 h-full font-bold uppercase tracking-wider text-xs px-4 min-w-[52px] shrink-0"
              >
                SYS
              </TabsTrigger>
              <TabsTrigger
                value="settings"
                className="rounded-none data-[state=active]:bg-primary data-[state=active]:text-black border-r border-primary/20 h-full font-bold uppercase tracking-wider text-xs px-4 min-w-[52px] shrink-0"
              >
                CFG
              </TabsTrigger>
              <TabsTrigger
                value="keyboard"
                className="rounded-none data-[state=active]:bg-primary data-[state=active]:text-black border-r border-primary/20 h-full font-bold uppercase tracking-wider text-xs px-4 min-w-[52px] shrink-0"
              >
                KBD
              </TabsTrigger>
              <TabsTrigger
                value="snapshots"
                className="rounded-none data-[state=active]:bg-primary data-[state=active]:text-black border-r border-primary/20 h-full font-bold uppercase tracking-wider text-xs px-4 min-w-[56px] shrink-0"
              >
                SNAP
              </TabsTrigger>
              <TabsTrigger
                value="twitch"
                className="rounded-none data-[state=active]:bg-primary data-[state=active]:text-black h-full font-bold uppercase tracking-wider text-xs px-4 min-w-[52px] shrink-0"
              >
                TTV
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4 min-h-0">
              <TabsContent value="controls" className="m-0 mt-0 border-none outline-none">
                <VmControls />
              </TabsContent>
              <TabsContent value="settings" className="m-0 mt-0 border-none outline-none">
                <SettingsPanel />
              </TabsContent>
              <TabsContent value="keyboard" className="m-0 mt-0 border-none outline-none">
                <KeyboardPanel />
              </TabsContent>
              <TabsContent value="snapshots" className="m-0 mt-0 border-none outline-none">
                <SnapshotsPanel />
              </TabsContent>
              <TabsContent value="twitch" className="m-0 mt-0 border-none outline-none">
                <TwitchPanel />
              </TabsContent>
            </div>
          </Tabs>
        </div>

      </div>
    </div>
  );
}
