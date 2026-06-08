import React, { useEffect, useState } from "react";
import { useGetVmConfig, useUpdateVmConfig, useListDiskImages, getGetVmConfigQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Save, Upload, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export function SettingsPanel() {
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useGetVmConfig();
  const { data: disks } = useListDiskImages();
  const updateConfig = useUpdateVmConfig();

  const [localConfig, setLocalConfig] = useState<any>(null);

  useEffect(() => {
    if (config) setLocalConfig(config);
  }, [config]);

  if (isLoading || !localConfig) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  const handleSave = () => {
    updateConfig.mutate({ data: localConfig }, {
      onSuccess: (newConfig) => {
        queryClient.setQueryData(getGetVmConfigQueryKey(), newConfig);
      }
    });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append("file", file);
    
    try {
      await fetch("/api/upload/disk", {
        method: "POST",
        body: formData,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/vm/disk-images"] });
    } catch (err) {
      console.error("Upload failed", err);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-4">
        {/* Disk Image */}
        <div className="space-y-2">
          <Label className="text-primary font-bold uppercase tracking-wider text-xs">Disk Image</Label>
          <div className="flex gap-2">
            <Select 
              value={localConfig.diskImage || ""} 
              onValueChange={(val) => setLocalConfig({...localConfig, diskImage: val})}
            >
              <SelectTrigger className="flex-1 border-primary/30 focus:ring-primary rounded-none bg-black/40">
                <SelectValue placeholder="Select image..." />
              </SelectTrigger>
              <SelectContent className="border-primary bg-background rounded-none">
                {disks?.map(d => (
                  <SelectItem key={d.path} value={d.path} className="rounded-none focus:bg-primary focus:text-black">
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" className="border-primary/50 rounded-none w-10 p-0 relative overflow-hidden group hover:bg-primary hover:text-black" title="Upload ISO/QCOW2">
              <Upload className="w-4 h-4" />
              <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleUpload} accept=".iso,.qcow2,.img" />
            </Button>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full justify-start text-xs border-dashed border-primary/30 hover:bg-primary/10 rounded-none text-muted-foreground hover:text-primary"
            onClick={() => setLocalConfig({...localConfig, diskImage: "windows-xp.qcow2"})}
          >
            <Download className="w-3 h-3 mr-2" />
            Quick Select: Windows XP (archive.org)
          </Button>
        </div>

        {/* Resources */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-primary font-bold uppercase tracking-wider text-xs">RAM (MB): {localConfig.ram}</Label>
            <Slider 
              value={[localConfig.ram]} 
              min={128} 
              max={2048} 
              step={128} 
              onValueChange={(v) => setLocalConfig({...localConfig, ram: v[0]})}
              className="py-2"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-primary font-bold uppercase tracking-wider text-xs">CPUs: {localConfig.cpus}</Label>
            <Slider 
              value={[localConfig.cpus]} 
              min={1} 
              max={4} 
              step={1} 
              onValueChange={(v) => setLocalConfig({...localConfig, cpus: v[0]})}
              className="py-2"
            />
          </div>
        </div>

        {/* System Settings */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-primary font-bold uppercase tracking-wider text-xs">PC Mode</Label>
            <Select value={localConfig.pcMode || "pc"} onValueChange={(val) => setLocalConfig({...localConfig, pcMode: val})}>
              <SelectTrigger className="border-primary/30 rounded-none bg-black/40"><SelectValue /></SelectTrigger>
              <SelectContent className="border-primary bg-background rounded-none">
                <SelectItem value="pc">Standard PC (pc)</SelectItem>
                <SelectItem value="q35">Q35 Machine</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-primary font-bold uppercase tracking-wider text-xs">VGA Type</Label>
            <Select value={localConfig.vgaType || "std"} onValueChange={(val) => setLocalConfig({...localConfig, vgaType: val})}>
              <SelectTrigger className="border-primary/30 rounded-none bg-black/40"><SelectValue /></SelectTrigger>
              <SelectContent className="border-primary bg-background rounded-none">
                <SelectItem value="std">Standard VGA</SelectItem>
                <SelectItem value="virtio">VirtIO</SelectItem>
                <SelectItem value="cirrus">Cirrus Logic</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Audio & Network */}
        <div className="grid grid-cols-2 gap-4 border border-primary/20 p-3 bg-black/20">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-primary font-bold uppercase tracking-wider text-xs">Audio</Label>
              <Switch checked={localConfig.audioEnabled} onCheckedChange={(v) => setLocalConfig({...localConfig, audioEnabled: v})} />
            </div>
            {localConfig.audioEnabled && (
              <Select value={localConfig.audioDevice || "ac97"} onValueChange={(val) => setLocalConfig({...localConfig, audioDevice: val})}>
                <SelectTrigger className="border-primary/30 rounded-none bg-black/40 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="border-primary bg-background rounded-none">
                  <SelectItem value="ac97">AC97</SelectItem>
                  <SelectItem value="hda">Intel HDA</SelectItem>
                  <SelectItem value="sb16">SoundBlaster 16</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-primary font-bold uppercase tracking-wider text-xs">Network</Label>
              <Switch checked={localConfig.networkEnabled} onCheckedChange={(v) => setLocalConfig({...localConfig, networkEnabled: v})} />
            </div>
            <div className="pt-2">
              <Label className="text-primary font-bold uppercase tracking-wider text-[10px] mb-1 block">Boot Order</Label>
              <Select value={localConfig.bootOrder || "c"} onValueChange={(val) => setLocalConfig({...localConfig, bootOrder: val})}>
                <SelectTrigger className="border-primary/30 rounded-none bg-black/40 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="border-primary bg-background rounded-none">
                  <SelectItem value="c">Hard Disk (C)</SelectItem>
                  <SelectItem value="d">CD-ROM (D)</SelectItem>
                  <SelectItem value="n">Network (N)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

      </div>

      <Button 
        className="w-full rounded-none font-bold uppercase tracking-wider hover:bg-primary/80 transition-all border border-primary bg-primary text-black"
        onClick={handleSave}
        disabled={updateConfig.isPending}
      >
        {updateConfig.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
        Apply Configuration
      </Button>
    </div>
  );
}
