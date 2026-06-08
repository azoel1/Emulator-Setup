import React, { useEffect, useState } from "react";
import { useGetTwitchConfig, useUpdateTwitchConfig, useGetTwitchCommandLog, getGetTwitchConfigQueryKey, getGetTwitchCommandLogQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, Loader2, MessageSquare, ShieldAlert, CheckCircle2, XCircle, Clock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

export function TwitchPanel() {
  const queryClient = useQueryClient();
  const { data: config, isLoading: isConfigLoading } = useGetTwitchConfig();
  const updateConfig = useUpdateTwitchConfig();

  const [localConfig, setLocalConfig] = useState<any>(null);

  useEffect(() => {
    if (config) {
      setLocalConfig({
        ...config,
        allowedUsers: config.allowedUsers?.join(", ") || ""
      });
    }
  }, [config]);

  const { data: commandLog } = useGetTwitchCommandLog({
    query: {
      queryKey: getGetTwitchCommandLogQueryKey(),
      refetchInterval: localConfig?.enabled ? 2000 : false,
      enabled: !!localConfig?.enabled,
    },
  });

  const handleSave = () => {
    if (!localConfig) return;
    
    const payload = {
      ...localConfig,
      allowedUsers: localConfig.allowedUsers 
        ? localConfig.allowedUsers.split(",").map((s: string) => s.trim()).filter(Boolean)
        : []
    };

    updateConfig.mutate({ data: payload }, {
      onSuccess: (newConfig) => {
        queryClient.setQueryData(getGetTwitchConfigQueryKey(), newConfig);
      }
    });
  };

  if (isConfigLoading || !localConfig) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="flex flex-col gap-6">
      {/* Config Form */}
      <div className="space-y-4 border border-primary/20 p-3 bg-black/40">
        <div className="flex items-center justify-between border-b border-primary/20 pb-2">
          <Label className="text-primary font-bold uppercase tracking-wider text-sm flex items-center">
            <MessageSquare className="w-4 h-4 mr-2" />
            Twitch Integration
          </Label>
          <Switch 
            checked={localConfig.enabled} 
            onCheckedChange={(v) => setLocalConfig({...localConfig, enabled: v})} 
          />
        </div>
        
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground uppercase font-bold">Channel Name</Label>
            <Input 
              value={localConfig.channel} 
              onChange={(e) => setLocalConfig({...localConfig, channel: e.target.value})}
              className="h-8 rounded-none border-primary/30 bg-black focus-visible:ring-primary font-mono text-sm"
              placeholder="twitch username"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground uppercase font-bold">Prefix</Label>
              <Input 
                value={localConfig.commandPrefix} 
                onChange={(e) => setLocalConfig({...localConfig, commandPrefix: e.target.value})}
                className="h-8 rounded-none border-primary/30 bg-black focus-visible:ring-primary font-mono text-sm text-center"
                placeholder="!"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1">
              <ShieldAlert className="w-3 h-3" /> Allowed Users (comma separated)
            </Label>
            <Input 
              value={localConfig.allowedUsers} 
              onChange={(e) => setLocalConfig({...localConfig, allowedUsers: e.target.value})}
              className="h-8 rounded-none border-primary/30 bg-black focus-visible:ring-primary font-mono text-sm"
              placeholder="Leave empty for all"
            />
          </div>

          <Button 
            className="w-full rounded-none h-8 text-xs font-bold uppercase border border-primary bg-primary text-black hover:bg-primary/80"
            onClick={handleSave}
            disabled={updateConfig.isPending}
          >
            {updateConfig.isPending ? <Loader2 className="w-3 h-3 mr-2 animate-spin" /> : <Save className="w-3 h-3 mr-2" />}
            Save Settings
          </Button>
        </div>
      </div>

      {/* Cheat Sheet */}
      <div className="border border-primary/20 bg-black/20 p-3">
        <Label className="text-primary font-bold uppercase tracking-wider text-[10px] border-b border-primary/20 pb-1 mb-2 block">Command Reference</Label>
        <div className="font-mono text-[10px] text-muted-foreground space-y-1">
          <p><span className="text-primary">!combo</span> win+r</p>
          <p><span className="text-primary">!send</span> text to type</p>
          <p><span className="text-primary">!wait</span> 0.5 <span className="text-muted-foreground/50">(seconds)</span></p>
          <p><span className="text-primary">!key</span> enter</p>
          <p className="mt-2 pt-2 border-t border-primary/10 text-primary/70 break-all">
            !combo win+r !wait 0.2 !send cmd !key enter
          </p>
        </div>
      </div>

      {/* Live Log */}
      <div className="flex flex-col flex-1 min-h-[200px]">
        <Label className="text-primary font-bold uppercase tracking-wider text-xs border-b border-primary/20 pb-1 mb-2">Live Log</Label>
        <div className="flex-1 bg-black border border-primary/20 overflow-y-auto p-2 font-mono text-xs space-y-2 max-h-[300px]">
          {!localConfig.enabled ? (
            <div className="text-muted-foreground/50 text-center mt-4">INTEGRATION DISABLED</div>
          ) : !commandLog || commandLog.length === 0 ? (
            <div className="text-muted-foreground/50 text-center mt-4">WAITING FOR SIGNAL...</div>
          ) : (
            commandLog.map((log) => (
              <div key={log.id} className="flex flex-col gap-1 border-b border-primary/10 pb-2">
                <div className="flex justify-between items-start">
                  <span className="text-primary font-bold">{log.username}</span>
                  <div className="flex items-center gap-1 text-[10px]">
                    {log.status === "executed" && <CheckCircle2 className="w-3 h-3 text-primary" />}
                    {log.status === "queued" && <Clock className="w-3 h-3 text-yellow-500" />}
                    {log.status === "error" && <XCircle className="w-3 h-3 text-destructive" />}
                    <span className="text-muted-foreground">{format(new Date(log.executedAt), "HH:mm:ss")}</span>
                  </div>
                </div>
                <span className="text-muted-foreground break-all">{log.rawCommand}</span>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}
